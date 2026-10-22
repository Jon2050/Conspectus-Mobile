import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import {
  resolveOpenRouterReasoning,
  type OpenRouterReasoningConfiguration,
} from '../../src/openrouter/reasoning';
import type { OpenRouterCompatibleModelCatalog } from '../../src/openrouter/modelCatalog';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

export const readReceiptEnvironment = () => {
  let local: Record<string, string | undefined> = {};
  try {
    local = parseEnv(readFileSync('.env.receipt.local', 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return { ...local, ...process.env };
};

export const requireReceiptSetting = (
  environment: Record<string, string | undefined>,
  name: string,
): string => {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Set ${name} in .env.receipt.local before running this command.`);
  return value;
};

export interface ReceiptLiveCase {
  id: string;
  image: string;
  // Full synthetic gold uses the existing extraction/derivation format.
  extraction?: Record<string, unknown>;
  derivation?: Record<string, unknown> | null;
  // Photographs can start with independently transcribed, partial expectations.
  expectedExtraction?: Record<string, unknown>;
  expectedLineTotalsCents?: number[];
  // Independent visual transcription; typography may vary; names must stay associated with their final amounts.
  expectedItems?: { name: string }[];
  // Recorded extraction for isolated text benchmarks; never treated as independent OCR gold.
  benchmarkExtraction?: Record<string, unknown>;
  note?: string;
}

export const readReceiptCases = (manifestPath: string): ReceiptLiveCase[] => {
  const manifest = resolve(manifestPath);
  const value: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
  if (!Array.isArray(value) || value.length === 0)
    throw new Error('Receipt manifest must be nonempty.');
  const ids = new Set<string>();
  return value.map((entry: ReceiptLiveCase) => {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim() || ids.has(entry.id))
      throw new Error('Receipt case IDs must be nonempty and unique.');
    if (typeof entry.image !== 'string' || !entry.image.trim())
      throw new Error(`Missing receipt image for ${entry.id}.`);
    ids.add(entry.id);
    return { ...entry, image: resolve(manifest, '..', entry.image) };
  });
};

// Provider content is deliberately retained only in ignored local reports. Never retain headers,
// request bodies (which contain image data), keys, or arbitrary exception objects.
export const redactReceiptText = (text: string, apiKey: string): string =>
  (apiKey ? text.replaceAll(apiKey, '[REDACTED]') : text).replace(
    /sk-or-v1-[a-zA-Z0-9_-]+/gu,
    '[REDACTED]',
  );

export const canonicalReceiptGroups = (value: Record<string, unknown>) =>
  (value.transfers as Record<string, unknown>[])
    .map(({ amountCents, categoryNames, buyplace, receiptDate, sourceItemIndexes }) => ({
      amountCents,
      categoryNames,
      buyplace,
      receiptDate,
      sourceItemIndexes: [...(sourceItemIndexes as number[])].sort((a, b) => a - b),
    }))
    .sort((a, b) => (a.sourceItemIndexes[0] ?? 0) - (b.sourceItemIndexes[0] ?? 0));

const REASONING_SNAPSHOT_PATH = 'output/receipt-live/model-reasoning.local.json';
const keyDigest = (apiKey: string) => createHash('sha256').update(apiKey.trim()).digest('hex');

// Explicit catalog command simulates Settings; live receipt analysis never refreshes this file.
export const writeReceiptReasoningSnapshot = (
  apiKey: string,
  catalog: OpenRouterCompatibleModelCatalog,
  metadataLatencyMs: number,
  path = REASONING_SNAPSHOT_PATH,
) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        version: 1,
        keyDigest: keyDigest(apiKey),
        capturedAt: new Date().toISOString(),
        metadataLatencyMs,
        models: Object.fromEntries(
          [...catalog.visionModels, ...catalog.transferModels].map((model) => [
            model.id,
            resolveOpenRouterReasoning(model.reasoning, 'lowest') ?? null,
          ]),
        ),
      },
      null,
      2,
    ),
  );
};

export const readReceiptReasoningSnapshot = (
  apiKey: string,
  visionModelId: string,
  transferModelId: string,
  path = REASONING_SNAPSHOT_PATH,
): {
  configuration: {
    visionReasoning?: OpenRouterReasoningConfiguration;
    transferReasoning?: OpenRouterReasoningConfiguration;
  };
  capturedAt: string | null;
  priorMetadataLatencyMs: number | null;
} => {
  const unknown = { configuration: {}, capturedAt: null, priorMetadataLatencyMs: null };
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (
      data?.version !== 1 ||
      data.keyDigest !== keyDigest(apiKey) ||
      !data.models ||
      typeof data.models !== 'object'
    )
      return unknown;
    const readModel = (id: string): OpenRouterReasoningConfiguration | undefined => {
      const config = data.models[id];
      if (
        typeof config?.enabled !== 'boolean' ||
        (config.enabled === false && config.effort !== undefined) ||
        (config.effort !== undefined &&
          !['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(config.effort))
      )
        return undefined;
      return config.effort ? { enabled: true, effort: config.effort } : { enabled: config.enabled };
    };
    const vision = readModel(visionModelId);
    const transfer = readModel(transferModelId);
    return {
      configuration: {
        ...(vision ? { visionReasoning: vision } : {}),
        ...(transfer ? { transferReasoning: transfer } : {}),
      },
      capturedAt: typeof data.capturedAt === 'string' ? data.capturedAt : null,
      priorMetadataLatencyMs:
        typeof data.metadataLatencyMs === 'number' ? data.metadataLatencyMs : null,
    };
  } catch {
    return unknown;
  }
};
