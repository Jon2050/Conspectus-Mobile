import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { build } from 'vite';
import { afterAll, expect, it } from 'vitest';
import { withRequestDeadline } from '../../src/shared/requestDeadline';
import {
  createOpenRouterChatCompletionClient,
  resolveOpenRouterReasoning,
  OPENROUTER_CHAT_COMPLETION_TIMEOUT_MS,
  type OpenRouterModelOption,
  createOpenRouterModelCatalogClient,
} from '../../src/openrouter';
import { createReceiptAnalysisController } from '../../src/features/receipt/receiptAnalysisController';
import { RECEIPT_IMAGE_JPEG_QUALITY } from '../../src/features/receipt/receiptImageNormalization';
import {
  receiptExtractionMessages,
  receiptDerivationMessages,
} from '../../src/features/receipt/receiptAnalysisMessages';
import type { ReceiptExtraction } from '../../src/features/receipt/receiptAnalysisContracts';
import type { OpenRouterChatMessage } from '../../src/openrouter';
import {
  parseReceiptExtractionResponse,
  parseReceiptTransferDerivationResponse,
} from '../../src/features/receipt/receiptAnalysisContracts';
import {
  DEFAULT_TRANSFER_DERIVATION_RULES,
  RECEIPT_EXTRACTION_SYSTEM_PROMPT,
  TRANSFER_DERIVATION_SYSTEM_PROMPT,
} from '../../src/features/receipt/prompts';
import gold from '../fixtures/receipts/gold.json';
import { evaluateReceiptImageSizeResponse } from './receiptImageSizeEvaluation';
import {
  canonicalReceiptGroups,
  readReceiptCases,
  readReceiptEnvironment,
  redactReceiptText,
  requireReceiptSetting,
  type ReceiptLiveCase,
} from './receiptSupport';

const environment = readReceiptEnvironment();
const manifestPath = environment.RECEIPT_TEST_CASES || 'tests/fixtures/receipts/gold.json';
let browser: Browser;
let imageHarnessScript: string;

const startImageBrowser = async () => {
  if (browser) return;
  // In-memory bundle: no app login, DB, test web server or network access from the browser.
  const bundle = await build({
    configFile: false,
    envFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: 'tests/live/receiptImageHarness.ts',
        name: 'ReceiptImageHarness',
        formats: ['iife'],
      },
    },
  });
  if ('on' in bundle) throw new Error('Unexpected watch bundle.');
  const script = (Array.isArray(bundle) ? bundle[0]! : bundle).output.find(
    (entry) => entry.type === 'chunk',
  );
  if (!script || script.type !== 'chunk') throw new Error('Missing image harness bundle.');
  imageHarnessScript = script.code;
  browser = await chromium.launch();
};

afterAll(async () => {
  await browser?.close();
});

const normalize = async (imagePath: string, maxLongEdgePx?: number) => {
  const bytes = readFileSync(imagePath);
  const mimeTypes: Record<string, string> = {
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
  };
  const mimeType = mimeTypes[extname(imagePath).toLowerCase()] ?? '';
  await startImageBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent('<!doctype html><title>Receipt image test</title>');
    await page.addScriptTag({ content: imageHarnessScript });
    return await page.evaluate(
      async ({ base64, mimeType, maxLongEdgePx }) => {
        const harness = window as unknown as {
          ReceiptImageHarness: typeof import('./receiptImageHarness');
        };
        return harness.ReceiptImageHarness.normalizeReceipt(base64, mimeType, maxLongEdgePx);
      },
      { base64: bytes.toString('base64'), mimeType, maxLongEdgePx },
    );
  } finally {
    await page.close();
  }
};

// Observes the real HTTP and parsing boundaries without changing provider/model behavior.
const analyze = async (
  entry: ReceiptLiveCase,
  apiKey: string,
  visionModelId: string,
  transferModelId: string,
  fetchImpl: typeof fetch = fetch,
  onProgress: (phase: string) => void = () => {},
) => {
  const started = performance.now();
  const completions: { raw: string; validation: unknown; latencyMs: number }[] = [];
  const requests: {
    endpoint: string;
    status: number;
    latencyMs: number;
    providerError?: unknown;
  }[] = [];
  const observedFetch: typeof fetch = async (url, options) => {
    const start = performance.now();
    const response = await fetchImpl(url, options);
    requests.push({
      endpoint: String(url).endsWith('/models/user')
        ? 'catalog'
        : String(url).includes('/benchmarks?')
          ? 'benchmarks'
          : 'completion',
      status: response.status,
      latencyMs: Math.round(performance.now() - start),
    });
    onProgress(`${requests[requests.length - 1]!.endpoint}: HTTP ${response.status}`);
    if (!response.ok) {
      try {
        const payload = (await response.clone().json()) as { error?: unknown };
        requests[requests.length - 1]!.providerError = payload.error;
      } catch {
        /* The production client still classifies unreadable provider responses. */
      }
    }
    return response;
  };
  const client = createOpenRouterChatCompletionClient({ fetch: observedFetch });
  const controller = createReceiptAnalysisController({
    catalogClient: createOpenRouterModelCatalogClient({ fetch: observedFetch }),
    completionClient: {
      async complete(request, signal) {
        const start = performance.now();
        const raw = await client.complete(request, signal);
        const extraction = completions[0];
        const parsedExtraction = extraction ? parseReceiptExtractionResponse(extraction.raw) : null;
        const validation =
          parsedExtraction?.ok && parsedExtraction.value.status === 'ok'
            ? parseReceiptTransferDerivationResponse(raw, parsedExtraction.value)
            : parseReceiptExtractionResponse(raw);
        completions.push({ raw, validation, latencyMs: Math.round(performance.now() - start) });
        return raw;
      },
    },
  });
  controller.subscribe((state) => {
    if (state.phase !== 'idle') onProgress(state.phase);
  });
  let normalization: unknown = null;
  let failure: string | null = null;
  let failureDetail: string | null = null;
  try {
    await withRequestDeadline(async (signal) => {
      onProgress('normalizing');
      const image = await normalize(entry.image);
      if (signal.aborted) throw signal.reason;
      normalization = { width: image.width, height: image.height, bytes: image.bytes.length };
      await controller.start(
        {
          image: { ...image, bytes: new Uint8Array(image.bytes) },
          configuration: {
            apiKey,
            visionModelId,
            transferModelId,
            extractionPrompt: RECEIPT_EXTRACTION_SYSTEM_PROMPT,
            transferPrompt: TRANSFER_DERIVATION_SYSTEM_PROMPT,
            transferRules: DEFAULT_TRANSFER_DERIVATION_RULES.text,
          },
        },
        signal,
      );
    }, 300_000);
  } catch (error) {
    failureDetail =
      error instanceof Error ? redactReceiptText(error.message, apiKey) : 'Unknown failure.';
    failure =
      controller.getState().errorCode ??
      (error instanceof DOMException && error.name === 'TimeoutError'
        ? 'run_timeout'
        : error instanceof Error && 'code' in error
          ? String(error.code)
          : 'image_or_harness_error');
  }
  const state = controller.getState();
  controller.dispose();
  return {
    id: entry.id,
    normalization,
    requests,
    completions,
    state,
    failure,
    failureDetail,
    latencyMs: Math.round(performance.now() - started),
  };
};

const offlineProvider = (...completions: (string | Response)[]): typeof fetch => {
  let completionIndex = 0;
  return async (url) => {
    if (String(url).includes('/benchmarks?'))
      return Response.json({
        data: [
          {
            source: 'artificial-analysis',
            model_permaslug: 'offline-model-snapshot',
            intelligence_index: 25,
          },
        ],
      });
    if (String(url).endsWith('/models/user')) {
      return Response.json({
        data: [
          {
            id: 'offline-model',
            canonical_slug: 'offline-model-snapshot',
            name: 'Offline model',
            architecture: { input_modalities: ['image', 'text'], output_modalities: ['text'] },
            pricing: { prompt: '0', completion: '0', image: '0' },
            supported_parameters: [],
          },
        ],
      });
    }
    const content = completions[completionIndex++];
    if (content instanceof Response) return content;
    return Response.json({
      choices: [{ finish_reason: 'stop', message: { content } }],
    });
  };
};

it('offline: normalizes a photograph and exercises both real clients and parsers with gold responses', async () => {
  const entry = readReceiptCases(manifestPath)[0]!;
  const result = await analyze(
    entry,
    'offline-key',
    'offline-model',
    'offline-model',
    offlineProvider(JSON.stringify(gold[0]!.extraction), JSON.stringify(gold[0]!.derivation)),
  );
  expect(result.failure, result.failureDetail ?? undefined).toBeNull();
  expect(result.state.phase).toBe('succeeded');
  expect(result.completions).toHaveLength(2);
  mkdirSync('output/receipt-live', { recursive: true });
  writeFileSync(
    'output/receipt-live/offline-check.json',
    JSON.stringify(
      {
        mode: 'synthetic_replies_no_OCR_measurement',
        normalization: result.normalization,
        phase: result.state.phase,
      },
      null,
      2,
    ),
  );
  expect(result.requests.map(({ endpoint }) => endpoint)).toEqual([
    'catalog',
    'benchmarks',
    'completion',
    'catalog',
    'benchmarks',
    'completion',
  ]);
});

it('offline: retains malformed extraction and identifies its parser failure without stage two', async () => {
  const result = await analyze(
    readReceiptCases('tests/fixtures/receipts/gold.json')[0]!,
    'offline-key',
    'offline-model',
    'offline-model',
    offlineProvider('{broken-json'),
  );
  expect(result.failure, result.failureDetail ?? undefined).toBe('invalid_response');
  expect(result.state.stage).toBe('extraction');
  expect(result.completions).toMatchObject([
    { raw: '{broken-json', validation: { ok: false, error: { code: 'MALFORMED_JSON' } } },
  ]);
  expect(result.requests).toHaveLength(3);
});

it('offline: records HTTP rate limiting as a provider failure without fabricated model results', async () => {
  const result = await analyze(
    readReceiptCases('tests/fixtures/receipts/gold.json')[0]!,
    'offline-key',
    'offline-model',
    'offline-model',
    offlineProvider(Response.json({ error: { code: 429 } }, { status: 429 })),
  );
  expect(result.failure, result.failureDetail ?? undefined).toBe('rate_limited');
  expect(result.state.phase).toBe('error');
  expect(result.completions).toEqual([]);
  expect(result.requests.map(({ status }) => status)).toEqual([200, 200, 429]);
});

it('offline: retains the failing second-stage answer with exact arithmetic diagnostics', async () => {
  const derivation = structuredClone(gold[0]!.derivation)!;
  derivation.transfers[0]!.amountCents += 1;
  const result = await analyze(
    readReceiptCases('tests/fixtures/receipts/gold.json')[0]!,
    'offline-key',
    'offline-model',
    'offline-model',
    offlineProvider(JSON.stringify(gold[0]!.extraction), JSON.stringify(derivation)),
  );
  expect(result.failure, result.failureDetail ?? undefined).toBe('invalid_response');
  expect(result.state.stage).toBe('derivation');
  expect(result.completions).toHaveLength(2);
  expect(result.completions[1]?.validation).toMatchObject({
    ok: false,
    error: { code: 'TRANSFER_ITEM_TOTAL_MISMATCH' },
  });
});

it('catalog: lists currently eligible model IDs using the production account-filtered catalog', async () => {
  const apiKey = requireReceiptSetting(environment, 'OPENROUTER_API_KEY');
  const catalog = await createOpenRouterModelCatalogClient().load(apiKey);
  console.log(JSON.stringify(catalog, null, 2));
  expect(
    catalog.visionModels.length,
    'No compatible free vision model in this account.',
  ).toBeGreaterThan(0);
  expect(
    catalog.transferModels.length,
    'No compatible free text model with an AA Intelligence Index of at least 20 in this account.',
  ).toBeGreaterThan(0);
});

it('benchmark: compares eligible models once per receipt role and reasoning mode', async () => {
  const stage = environment.RECEIPT_BENCHMARK_STAGE || 'all';
  const modes: ('lowest' | 'off')[] =
    environment.RECEIPT_BENCHMARK_REASONING === 'compare'
      ? ['lowest', 'off']
      : [environment.RECEIPT_BENCHMARK_REASONING === 'off' ? 'off' : 'lowest'];
  expect(['all', 'extraction', 'derivation']).toContain(stage);
  const apiKey = requireReceiptSetting(environment, 'OPENROUTER_API_KEY');
  const configuredVision = requireReceiptSetting(environment, 'OPENROUTER_VISION_MODEL');
  const configuredTransfer = requireReceiptSetting(environment, 'OPENROUTER_TRANSFER_MODEL');
  const entry = readReceiptCases(manifestPath)[0]!;
  const catalog = await createOpenRouterModelCatalogClient().load(apiKey);
  const image = await normalize(entry.image);
  const output = resolve('output/receipt-benchmark', new Date().toISOString().replaceAll(':', '-'));
  mkdirSync(output, { recursive: true });
  writeFileSync(`${output}/image.jpg`, new Uint8Array(image.bytes));
  const rows: Record<string, unknown>[] = [];
  const report = {
    capturedAt: new Date().toISOString(),
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workingTreeDirty: Boolean(
      execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    ),
    caseId: entry.id,
    catalog,
    extractionPromptVersion: RECEIPT_EXTRACTION_SYSTEM_PROMPT.version,
    derivationPromptVersion: TRANSFER_DERIVATION_SYSTEM_PROMPT.version,
    rulesVersion: DEFAULT_TRANSFER_DERIVATION_RULES.version,
    configuredVision,
    configuredTransfer,
    stage,
    modes,
    referenceModel: null as string | null,
    rows,
  };
  const save = () =>
    writeFileSync(
      `${output}/report.json`,
      redactReceiptText(JSON.stringify(report, null, 2), apiKey),
    );
  const run = async (
    stage: 'extraction' | 'derivation',
    modelOption: OpenRouterModelOption,
    messages: readonly OpenRouterChatMessage[],
    extraction: ReceiptExtraction | undefined,
    mode: 'lowest' | 'off',
  ) => {
    const model = modelOption.id;
    const reasoning = resolveOpenRouterReasoning(modelOption.reasoning, mode);
    if (mode === 'off' && modelOption.reasoning?.mandatory) {
      const row: Record<string, unknown> = {
        stage,
        model,
        mode,
        skipped: 'reasoning_mandatory',
        capabilities: modelOption.reasoning,
      };
      rows.push(row);
      save();
      return row;
    }
    const started = performance.now();
    const row: Record<string, unknown> = {
      stage,
      model,
      mode,
      reasoning,
      capabilities: modelOption.reasoning,
    };
    let payloadTask: Promise<void> | undefined;
    const stem = `${rows.length + 1}-${stage}`;
    const observedFetch: typeof fetch = async (url, options) => {
      // Exact wire body, excluding credentials in headers. Image bytes remain local and ignored.
      writeFileSync(`${output}/${stem}.request.json`, String(options?.body));
      const response = await fetch(url, options);
      row.httpStatus = response.status;
      row.headersMs = Math.round(performance.now() - started);
      payloadTask = response
        .clone()
        .text()
        .then((body) => {
          writeFileSync(`${output}/${stem}.response.txt`, redactReceiptText(body, apiKey));
          try {
            const payload = JSON.parse(body) as Record<string, unknown>;
            row.usage = payload.usage;
            row.provider = payload.provider;
            row.providerError = payload.error;
          } catch {
            /* Production parsing reports malformed responses. */
          }
        })
        .catch(() => {});
      return response;
    };
    console.log(`${stage}: ${model}, ${mode}, ${JSON.stringify(reasoning)} started`);
    try {
      const raw = await withRequestDeadline(
        (signal) =>
          createOpenRouterChatCompletionClient({ fetch: observedFetch }).complete(
            { apiKey, model, messages, reasoning },
            signal,
          ),
        OPENROUTER_CHAT_COMPLETION_TIMEOUT_MS,
      );
      row.latencyMs = Math.round(performance.now() - started);
      row.raw = raw;
      row.validation = extraction
        ? parseReceiptTransferDerivationResponse(raw, extraction)
        : parseReceiptExtractionResponse(raw);
      await payloadTask;
    } catch (error) {
      row.latencyMs = Math.round(performance.now() - started);
      row.failure =
        error instanceof DOMException && error.name === 'TimeoutError'
          ? 'timeout'
          : error instanceof Error && 'code' in error && typeof error.code === 'string'
            ? error.code
            : 'request_failed';
    }
    rows.push(row);
    save();
    console.log(
      `${stage}: ${model}, ${mode}: ${row.latencyMs} ms, HTTP ${row.httpStatus ?? '-'}, ${row.failure ?? 'response received; validation in report'}`,
    );
    return row;
  };
  let reference: ReceiptExtraction | undefined;
  const visionModels = [...catalog.visionModels].sort(
    (a, b) => Number(b.id === configuredVision) - Number(a.id === configuredVision),
  );
  for (const model of stage === 'derivation' ? [] : visionModels)
    for (const mode of modes) {
      const row = await run(
        'extraction',
        model,
        receiptExtractionMessages(
          RECEIPT_EXTRACTION_SYSTEM_PROMPT.text,
          Buffer.from(image.bytes).toString('base64'),
        ),
        undefined,
        mode,
      );
      const result = row.validation as
        | ReturnType<typeof parseReceiptExtractionResponse>
        | undefined;
      if (!reference && result?.ok && result.value.status === 'ok') {
        try {
          if (entry.expectedExtraction)
            expect(result.value).toMatchObject(entry.expectedExtraction);
          if (entry.expectedLineTotalsCents)
            expect(result.value.items.map((item) => item.lineTotalCents)).toEqual(
              entry.expectedLineTotalsCents,
            );
          reference = result.value;
          report.referenceModel = model.id;
        } catch {
          row.referenceExpectationMismatch = true;
          save();
        }
      }
    }
  // An optional reviewed/recorded reference allows text benchmarking even if every vision provider fails.
  if (!reference && (entry.benchmarkExtraction || entry.extraction)) {
    const parsed = parseReceiptExtractionResponse(
      JSON.stringify(entry.benchmarkExtraction || entry.extraction),
    );
    if (parsed.ok && parsed.value.status === 'ok') {
      if (entry.expectedExtraction) expect(parsed.value).toMatchObject(entry.expectedExtraction);
      if (entry.expectedLineTotalsCents)
        expect(parsed.value.items.map((item) => item.lineTotalCents)).toEqual(
          entry.expectedLineTotalsCents,
        );
      reference = parsed.value;
      report.referenceModel = entry.benchmarkExtraction
        ? 'manifest_recorded_extraction'
        : 'manifest_gold';
    }
  }
  if (stage === 'extraction') {
    save();
    expect(rows).toHaveLength(catalog.visionModels.length * modes.length);
    return;
  }
  expect(
    reference,
    'No valid extraction for the common text-stage input; see vision diagnostics.',
  ).toBeDefined();
  writeFileSync(`${output}/reference-extraction.json`, JSON.stringify(reference, null, 2));
  const messages = receiptDerivationMessages(
    TRANSFER_DERIVATION_SYSTEM_PROMPT.text,
    DEFAULT_TRANSFER_DERIVATION_RULES.text,
    reference!,
  );
  for (const model of catalog.transferModels)
    for (const mode of modes) await run('derivation', model, messages, reference!, mode);
  save();
  console.log(`Model comparison: ${output}/report.json`);
  expect(rows).toHaveLength(
    ((stage === 'derivation' ? 0 : catalog.visionModels.length) + catalog.transferModels.length) *
      modes.length,
  );
  // Provider/quality failures are data, never silently skipped or retried by a latency comparison.
});

it('image-sizes: compares five photograph sizes with active minimum reasoning and independent gold', async () => {
  const apiKey = requireReceiptSetting(environment, 'OPENROUTER_API_KEY');
  const modelId = requireReceiptSetting(environment, 'OPENROUTER_VISION_MODEL');
  const entry = readReceiptCases(manifestPath)[0]!;
  expect(
    entry.expectedExtraction,
    'Provide independently transcribed photograph metadata.',
  ).toBeDefined();
  expect(
    entry.expectedLineTotalsCents,
    'Provide every independently transcribed line amount.',
  ).toBeDefined();
  expect(
    entry.expectedItems,
    'Provide independently transcribed item names and quantities.',
  ).toBeDefined();
  const catalog = await createOpenRouterModelCatalogClient().load(apiKey);
  const model = catalog.visionModels.find(({ id }) => id === modelId);
  expect(
    model,
    'The configured vision model must pass the current production filters.',
  ).toBeDefined();
  const reasoning = resolveOpenRouterReasoning(model!.reasoning, 'lowest');
  const sizes = [2560, 1920, 1600, 1280, 960];
  const output = resolve(
    'output/receipt-image-sizes',
    new Date().toISOString().replaceAll(':', '-'),
  );
  mkdirSync(output, { recursive: true });
  const rows: Record<string, unknown>[] = [];
  const report = {
    capturedAt: new Date().toISOString(),
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workingTreeDirty: Boolean(
      execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    ),
    caseId: entry.id,
    model,
    reasoning,
    extractionPromptVersion: RECEIPT_EXTRACTION_SYSTEM_PROMPT.version,
    jpegQuality: RECEIPT_IMAGE_JPEG_QUALITY,
    sizes,
    repetitions: 3,
    scope: 'Stage one only; stage two receives no image. Requests are sequential, with no retries.',
    labelComparison:
      'Ignore case, whitespace and punctuation; equate umlauts with AE/OE/UE. Keep all letters and digits.',
    expectations: {
      metadata: entry.expectedExtraction,
      lineTotalsCents: entry.expectedLineTotalsCents,
      items: entry.expectedItems,
    },
    rows,
  };
  const save = () =>
    writeFileSync(
      `${output}/report.json`,
      redactReceiptText(JSON.stringify(report, null, 2), apiKey),
    );
  // Every target is encoded directly from the original, never from a previously reduced JPEG.
  const images = new Map<number, Awaited<ReturnType<typeof normalize>>>();
  for (const size of sizes) {
    const started = performance.now();
    const image = await normalize(entry.image, size);
    images.set(size, image);
    writeFileSync(`${output}/${size}.jpg`, new Uint8Array(image.bytes));
    console.log(
      `Prepared ${image.width}x${image.height}, ${image.bytes.length} JPEG bytes, ${Math.round(performance.now() - started)} ms`,
    );
  }
  save();
  const orders = [sizes, [...sizes].reverse(), [...sizes.slice(2), ...sizes.slice(0, 2)]];
  for (const [round, order] of orders.entries())
    for (const size of order) {
      const image = images.get(size)!;
      const stem = `${String(rows.length + 1).padStart(2, '0')}-${size}-round${round + 1}`;
      const row: Record<string, unknown> = {
        round: round + 1,
        longEdgePx: size,
        width: image.width,
        height: image.height,
        jpegBytes: image.bytes.length,
      };
      let payloadTask: Promise<void> | undefined;
      const started = performance.now();
      const observedFetch: typeof fetch = async (url, options) => {
        writeFileSync(
          `${output}/${stem}.request.json`,
          redactReceiptText(String(options?.body), apiKey),
        );
        const response = await fetch(url, options);
        row.httpStatus = response.status;
        row.headersMs = Math.round(performance.now() - started);
        payloadTask = response
          .clone()
          .text()
          .then((body) => {
            writeFileSync(`${output}/${stem}.response.txt`, redactReceiptText(body, apiKey));
            try {
              const payload = JSON.parse(body) as Record<string, unknown>;
              row.usage = payload.usage;
              row.provider = payload.provider;
              row.providerError = payload.error;
            } catch {
              /* The production parser records malformed output. */
            }
          })
          .catch(() => {});
        return response;
      };
      console.log(
        `Image ${size}px, round ${round + 1}/3: ${modelId}, reasoning ${JSON.stringify(reasoning)} started`,
      );
      try {
        const raw = await withRequestDeadline(
          (signal) =>
            createOpenRouterChatCompletionClient({ fetch: observedFetch }).complete(
              {
                apiKey,
                model: modelId,
                reasoning,
                messages: receiptExtractionMessages(
                  RECEIPT_EXTRACTION_SYSTEM_PROMPT.text,
                  Buffer.from(image.bytes).toString('base64'),
                ),
              },
              signal,
            ),
          OPENROUTER_CHAT_COMPLETION_TIMEOUT_MS,
        );
        row.latencyMs = Math.round(performance.now() - started);
        row.raw = raw;
        Object.assign(row, evaluateReceiptImageSizeResponse(raw, entry));
      } catch (error) {
        row.latencyMs = Math.round(performance.now() - started);
        row.failure =
          error instanceof DOMException && error.name === 'TimeoutError'
            ? 'timeout'
            : error instanceof Error && 'code' in error
              ? String(error.code)
              : 'request_failed';
      }
      await payloadTask;
      rows.push(row);
      save();
      console.log(
        `Image ${size}px, round ${round + 1}: ${row.latencyMs} ms; ${row.failure ?? JSON.stringify(row.quality ?? row.validation)}`,
      );
    }
  console.log(`Image size comparison: ${output}/report.json`);
  expect(rows).toHaveLength(sizes.length * orders.length);
  // Completing the experiment does not mean that all resolutions passed OCR quality.
});

it('live: evaluates real receipt images through the production two-stage analysis', async () => {
  const apiKey = requireReceiptSetting(environment, 'OPENROUTER_API_KEY');
  const visionModelId = requireReceiptSetting(environment, 'OPENROUTER_VISION_MODEL');
  const transferModelId = requireReceiptSetting(environment, 'OPENROUTER_TRANSFER_MODEL');
  const cases = readReceiptCases(manifestPath);
  const output = resolve('output/receipt-live', new Date().toISOString().replaceAll(':', '-'));
  mkdirSync(output, { recursive: true });
  const report = {
    visionModelId,
    transferModelId,
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workingTreeDirty: Boolean(
      execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    ),
    capturedAt: new Date().toISOString(),
    extractionPromptVersion: RECEIPT_EXTRACTION_SYSTEM_PROMPT.version,
    derivationPromptVersion: TRANSFER_DERIVATION_SYSTEM_PROMPT.version,
    rulesVersion: DEFAULT_TRANSFER_DERIVATION_RULES.version,
    cases: [] as unknown[],
  };
  const failures: string[] = [];
  for (const entry of cases) {
    const result = await analyze(entry, apiKey, visionModelId, transferModelId, fetch, (phase) =>
      console.log(`${entry.id}: ${phase}`),
    );
    let verdict = 'partial_expectations_passed_requires_grouping_review';
    let expectationFailure: string | null = null;
    try {
      const extraction = result.completions[0]?.validation as
        | ReturnType<typeof parseReceiptExtractionResponse>
        | undefined;
      // Only an actual, contract-valid model rejection counts as a safe rejection.
      if (
        entry.extraction?.status === 'error' ||
        entry.derivation?.status === 'error' ||
        entry.derivation === null
      ) {
        const derivation = result.completions[1]?.validation as
          | ReturnType<typeof parseReceiptTransferDerivationResponse>
          | undefined;
        expect(
          (extraction?.ok && extraction.value.status === 'error') ||
            (derivation?.ok && derivation.value.status === 'error'),
        ).toBe(true);
        verdict = 'safe_rejection';
      } else {
        expect(
          result.failure,
          'Analysis failed; inspect completions and parser diagnostics in report.json.',
        ).toBeNull();
        expect(result.state.phase).toBe('succeeded');
        expect(extraction?.ok).toBe(true);
        if (!extraction?.ok || extraction.value.status !== 'ok')
          throw new Error('Missing extraction.');
        if (entry.extraction) expect(extraction.value).toEqual(entry.extraction);
        if (entry.expectedExtraction)
          expect(extraction.value).toMatchObject(entry.expectedExtraction);
        if (entry.expectedLineTotalsCents)
          expect(extraction.value.items.map(({ lineTotalCents }) => lineTotalCents)).toEqual(
            entry.expectedLineTotalsCents,
          );
        if (entry.derivation) {
          expect(
            canonicalReceiptGroups(result.state.derivation! as unknown as Record<string, unknown>),
          ).toEqual(
            canonicalReceiptGroups(
              (
                parseReceiptTransferDerivationResponse(
                  JSON.stringify(entry.derivation),
                  extraction.value,
                ) as unknown as { ok: true; value: Record<string, unknown> }
              ).value,
            ),
          );
          verdict = 'correct';
        }
      }
    } catch (error) {
      verdict = 'failed';
      expectationFailure =
        error instanceof Error ? error.message.slice(0, 8_000) : 'Expectation failed.';
      failures.push(`${entry.id}: ${result.failure ?? 'gold_expectation_mismatch'}`);
    }
    report.cases.push({ ...result, verdict, expectationFailure });
    // Flush after every case so an interrupted corpus run retains completed evidence.
    writeFileSync(
      `${output}/report.json`,
      redactReceiptText(JSON.stringify(report, null, 2), apiKey),
    );
    console.log(`${entry.id}: ${verdict} (${result.latencyMs} ms)`);
  }
  console.log(`Local receipt diagnostics: ${output}/report.json`);
  expect(
    failures,
    'See local report.json for raw completions, validation errors and stage.',
  ).toEqual([]);
});
