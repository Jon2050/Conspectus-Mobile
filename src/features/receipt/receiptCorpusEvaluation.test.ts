// Offline gold-standard comparison. Mock/gold replay validates the evaluator, never model quality.
import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import gold from '../../../tests/fixtures/receipts/gold.json';
import {
  parseReceiptExtractionResponse,
  parseReceiptTransferDerivationResponse,
  type ReceiptTransferDerivation,
} from './receiptAnalysisContracts';
import {
  DEFAULT_TRANSFER_DERIVATION_RULES,
  RECEIPT_EXTRACTION_SYSTEM_PROMPT,
  TRANSFER_DERIVATION_SYSTEM_PROMPT,
} from './prompts';

type GoldCase = (typeof gold)[number];
interface Observation {
  readonly id: string;
  readonly extraction: unknown;
  readonly derivation: unknown;
  readonly latencyMs: number;
}

const groups = (derivation: ReceiptTransferDerivation) =>
  derivation.transfers
    .map((transfer) => ({
      // Transfer titles are user-facing summaries; semantic identity is the line/category assignment.
      amountCents: transfer.amountCents,
      categoryNames: transfer.categoryNames,
      buyplace: transfer.buyplace,
      receiptDate: transfer.receiptDate,
      sourceItemIndexes: [...transfer.sourceItemIndexes].sort((a, b) => a - b),
    }))
    .sort((a, b) => (a.sourceItemIndexes[0] ?? 0) - (b.sourceItemIndexes[0] ?? 0));

const evaluate = (expected: GoldCase, observed: Observation) => {
  const extraction = parseReceiptExtractionResponse(JSON.stringify(observed.extraction));
  const shouldAccept = expected.derivation?.status === 'ok';
  const rejection = shouldAccept ? 'false_rejection' : 'safe_rejection';
  if (!extraction.ok || extraction.value.status === 'error') return rejection;
  const derivation = parseReceiptTransferDerivationResponse(
    JSON.stringify(observed.derivation),
    extraction.value,
  );
  if (!derivation.ok || derivation.value.status === 'error') return rejection;
  if (!shouldAccept || !isDeepStrictEqual(extraction.value, expected.extraction))
    return 'unsafe_acceptance';
  return isDeepStrictEqual(
    groups(derivation.value),
    groups(expected.derivation as ReceiptTransferDerivation),
  )
    ? 'correct'
    : 'unsafe_acceptance';
};

describe('synthetic receipt gold corpus and evaluation', () => {
  it.each(gold)('validates the independent gold answer: $id', (entry) => {
    expect(readFileSync(`tests/fixtures/receipts/${entry.image}`, 'utf8')).toContain('<svg');
    expect(
      evaluate(entry, {
        id: entry.id,
        extraction: entry.extraction,
        derivation: entry.derivation,
        latencyMs: 0,
      }),
    ).toBe(entry.derivation?.status === 'ok' ? 'correct' : 'safe_rejection');
    // Error gold answers must themselves pass the real error contract, not just fail closed.
    const extraction = parseReceiptExtractionResponse(JSON.stringify(entry.extraction));
    expect(extraction.ok).toBe(true);
    if (entry.derivation && extraction.ok && extraction.value.status === 'ok') {
      expect(
        parseReceiptTransferDerivationResponse(JSON.stringify(entry.derivation), extraction.value)
          .ok,
      ).toBe(true);
    }
  });

  it('detects arithmetically consistent but semantically wrong groups and OCR', () => {
    const entry = gold.find(({ id }) => id === 'mixed-discount')!;
    const derivation = structuredClone(entry.derivation)!;
    derivation.transfers[1]!.categoryNames = ['Einkauf', 'Lebensmittel'];
    expect(evaluate(entry, { ...entry, derivation, latencyMs: 1 })).toBe('unsafe_acceptance');
    const extraction = { ...entry.extraction, receiptDate: '2026-10-19' };
    const wrongDate = {
      ...entry.derivation!,
      transfers: entry.derivation!.transfers.map((transfer) => ({
        ...transfer,
        receiptDate: '2026-10-19',
      })),
    };
    expect(evaluate(entry, { ...entry, extraction, derivation: wrongDate, latencyMs: 1 })).toBe(
      'unsafe_acceptance',
    );
  });

  it('distinguishes safe rejection from rejecting supported receipts', () => {
    for (const entry of gold) {
      expect(
        evaluate(entry, { id: entry.id, extraction: {}, derivation: null, latencyMs: 1 }),
      ).toBe(entry.derivation?.status === 'ok' ? 'false_rejection' : 'safe_rejection');
    }
  });

  it.skipIf(!process.env.RECEIPT_EVALUATION_INPUT)(
    'scores complete recorded model-pair runs against gold',
    () => {
      const runs = JSON.parse(readFileSync(process.env.RECEIPT_EVALUATION_INPUT!, 'utf8')) as {
        visionModelId: string;
        transferModelId: string;
        sourceRevision: string;
        capturedAt: string;
        extractionPromptVersion: number;
        derivationPromptVersion: number;
        rulesVersion: number;
        cases: Observation[];
      }[];
      expect(runs.length).toBeGreaterThan(0);
      const reports = runs.map((run) => {
        expect(run.visionModelId.trim()).not.toBe('');
        expect(run.transferModelId.trim()).not.toBe('');
        expect(run.sourceRevision).toMatch(/^[a-f0-9]{40}$/u);
        expect(Number.isFinite(Date.parse(run.capturedAt))).toBe(true);
        expect(run.extractionPromptVersion).toBe(RECEIPT_EXTRACTION_SYSTEM_PROMPT.version);
        expect(run.derivationPromptVersion).toBe(TRANSFER_DERIVATION_SYSTEM_PROMPT.version);
        expect(run.rulesVersion).toBe(DEFAULT_TRANSFER_DERIVATION_RULES.version);
        expect(run.cases.map(({ id }) => id).sort()).toEqual(gold.map(({ id }) => id).sort());
        const results = run.cases.map((observation) => {
          expect(Number.isFinite(observation.latencyMs) && observation.latencyMs >= 0).toBe(true);
          return {
            id: observation.id,
            latencyMs: observation.latencyMs,
            result: evaluate(gold.find(({ id }) => id === observation.id)!, observation),
          };
        });
        return {
          visionModelId: run.visionModelId,
          transferModelId: run.transferModelId,
          sourceRevision: run.sourceRevision,
          capturedAt: run.capturedAt,
          correct: results.filter(({ result }) => result === 'correct').length,
          safeRejections: results.filter(({ result }) => result === 'safe_rejection').length,
          falseRejections: results.filter(({ result }) => result === 'false_rejection').length,
          unsafeAcceptances: results.filter(({ result }) => result === 'unsafe_acceptance').length,
          meanLatencyMs:
            results.reduce((sum, result) => sum + result.latencyMs, 0) / results.length,
          results,
        };
      });
      if (process.env.RECEIPT_EVALUATION_REPORT)
        writeFileSync(process.env.RECEIPT_EVALUATION_REPORT, JSON.stringify(reports, null, 2));
      expect(
        reports.every((report) => report.unsafeAcceptances === 0 && report.falseRejections === 0),
      ).toBe(true);
    },
  );
});
