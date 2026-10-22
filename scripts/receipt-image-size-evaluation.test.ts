import { describe, expect, it } from 'vitest';
import {
  receiptExtractionData,
  type ReceiptExtractionResult,
} from '../src/features/receipt/receiptAnalysisContracts';
import {
  evaluateReceiptImageSizeExtraction,
  evaluateReceiptImageSizeResponse,
} from '../tests/live/receiptImageSizeEvaluation';
import type { ReceiptLiveCase } from '../tests/live/receiptSupport';

const gold: ReceiptLiveCase = {
  id: 'independent',
  image: 'private.jpg',
  expectedExtraction: {
    storeName: 'Markt oHG',
    receiptDate: '2026-10-19',
    receiptTotalCents: 299,
  },
  expectedLineTotalsCents: [299],
  expectedItems: [{ name: 'BACKFISCHSTÄB.' }],
};
const extraction = (): ReceiptExtractionResult => ({
  status: 'ok',
  errorReason: null,
  storeName: 'Markt OHG',
  receiptDate: '2026-10-19',
  receiptTotalCents: 299,
  items: [
    {
      index: 0,
      name: 'BACKFISCHSTAEB',
      lineTotalCents: 299,
    },
  ],
});

describe('independent image-size OCR evaluation', () => {
  it('retains the real parser failure while diagnosing wrong arithmetic against independent gold', () => {
    const value = { ...extraction(), receiptTotalCents: 300 };
    expect(
      evaluateReceiptImageSizeResponse(JSON.stringify(receiptExtractionData(value)), gold),
    ).toMatchObject({
      validation: { ok: false, error: { code: 'ITEM_TOTAL_MISMATCH' } },
      quality: {
        allCorrect: false,
        monetaryExact: false,
        metadataMismatches: [{ field: 'receiptTotalCents', expected: 299, actual: 300 }],
      },
    });
    expect(evaluateReceiptImageSizeResponse('{broken', gold)).toEqual({
      validation: { ok: false, error: { code: 'MALFORMED_JSON', message: expect.any(String) } },
    });
  });
  it('accepts typography differences but preserves exact final amounts', () => {
    expect(evaluateReceiptImageSizeExtraction(extraction(), gold)).toMatchObject({
      allCorrect: true,
      monetaryExact: true,
      textCorrect: true,
      typographyDifferences: [{ index: 0, expected: 'BACKFISCHSTÄB.', actual: 'BACKFISCHSTAEB' }],
    });
  });
  it('detects self-consistent wrong amounts instead of treating parser success as correct OCR', () => {
    const value = extraction();
    const wrong = {
      ...value,
      receiptTotalCents: 300,
      items: value.items.map((item) => ({ ...item, lineTotalCents: 300 })),
    };
    expect(evaluateReceiptImageSizeExtraction(wrong, gold)).toMatchObject({
      allCorrect: false,
      monetaryExact: false,
      amountMismatches: [{ index: 0, expected: 299, actual: 300 }],
    });
  });
  it('detects changed letters, merchant and missing or extra items', () => {
    const value = extraction();
    expect(
      evaluateReceiptImageSizeExtraction(
        {
          ...value,
          storeName: 'Other shop',
          items: value.items.map((item) => ({ ...item, name: 'FISCH' })),
        },
        gold,
      ),
    ).toMatchObject({
      allCorrect: false,
      monetaryExact: true,
      textCorrect: false,
    });
    for (const items of [[], [...value.items, ...value.items]])
      expect(evaluateReceiptImageSizeExtraction({ ...value, items }, gold)).toMatchObject({
        allCorrect: false,
        monetaryExact: false,
        textCorrect: false,
      });
  });
  it('permits 0/O only in article labels while enforcing the exact merchant for model comparisons', () => {
    const entry = {
      ...gold,
      expectedItems: [{ name: 'MILCH0,1%' }],
    };
    const original = extraction();
    const value = {
      ...original,
      storeName: 'Markt oHG',
      items: original.items.map((item) => ({ ...item, name: 'MILCHO,1%' })),
    };
    const options = { exactStoreName: true, allowZeroLetter: true };
    expect(
      evaluateReceiptImageSizeResponse(
        JSON.stringify(receiptExtractionData(value)),
        entry,
        options,
      ),
    ).toMatchObject({
      validation: { ok: true },
      quality: { allCorrect: true },
    });
    expect(evaluateReceiptImageSizeExtraction(value, entry).allCorrect).toBe(false);
    expect(
      evaluateReceiptImageSizeExtraction({ ...value, storeName: 'Markt OHG' }, entry, options),
    ).toMatchObject({ allCorrect: false, metadataMismatches: [{ field: 'storeName' }] });
    expect(
      evaluateReceiptImageSizeExtraction({ ...value, receiptDate: '2026-10-18' }, entry, options),
    ).toMatchObject({ allCorrect: false, monetaryExact: false });
  });
  it('never counts partial model errors or missing independent gold as complete correctness', () => {
    expect(
      evaluateReceiptImageSizeExtraction(
        { ...extraction(), status: 'error', errorReason: 'Unlesbar.' },
        gold,
      ).allCorrect,
    ).toBe(false);
    expect(
      evaluateReceiptImageSizeExtraction(extraction(), { id: 'missing', image: 'unknown' })
        .allCorrect,
    ).toBe(false);
  });
});
