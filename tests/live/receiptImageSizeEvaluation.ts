// Independent photograph expectations: never compare one model answer to another as OCR gold.
import type { ReceiptExtractionResult } from '../../src/features/receipt/receiptAnalysisContracts';
import type { ReceiptLiveCase } from './receiptSupport';
import { parseReceiptExtractionResponse } from '../../src/features/receipt/receiptAnalysisContracts';

const normalizedLabel = (value: unknown) =>
  typeof value === 'string'
    ? value
        .normalize('NFC')
        .toUpperCase()
        .replaceAll('Ä', 'AE')
        .replaceAll('Ö', 'OE')
        .replaceAll('Ü', 'UE')
        .replace(/[^\p{L}\p{N}]/gu, '')
    : value;

export const evaluateReceiptImageSizeExtraction = (
  value: ReceiptExtractionResult,
  entry: ReceiptLiveCase,
) => {
  const metadataMismatches = Object.entries(entry.expectedExtraction ?? entry.extraction ?? {})
    .filter(([key]) => !['items', 'status', 'errorReason'].includes(key))
    .flatMap(([field, expected]) => {
      const actual = value[field as keyof ReceiptExtractionResult];
      const equal =
        field === 'storeName'
          ? normalizedLabel(actual) === normalizedLabel(expected)
          : actual === expected;
      return equal ? [] : [{ field, expected, actual }];
    });
  const expectedAmounts = entry.expectedLineTotalsCents;
  const amountMismatches =
    expectedAmounts?.flatMap((expected, index) => {
      const actual = value.items[index]?.lineTotalCents;
      return actual === expected ? [] : [{ index, expected, actual: actual ?? null }];
    }) ?? [];
  const expectedItems = entry.expectedItems;
  const nameMismatches: { index: number; expected: string; actual: string | null }[] = [];
  const quantityMismatches: { index: number; expected: number | null; actual: number | null }[] =
    [];
  const typographyDifferences: { index: number; expected: string; actual: string }[] = [];
  expectedItems?.forEach((expected, index) => {
    const actual = value.items[index];
    if (normalizedLabel(actual?.name) !== normalizedLabel(expected.name))
      nameMismatches.push({ index, expected: expected.name, actual: actual?.name ?? null });
    else if (actual && actual.name !== expected.name)
      typographyDifferences.push({ index, expected: expected.name, actual: actual.name });
    const quantity = actual?.quantityText?.match(/\d+(?:[,.]\d+)?/u)?.[0];
    const actualQuantity = quantity ? Number(quantity.replace(',', '.')) : null;
    if (actualQuantity !== expected.quantityValue)
      quantityMismatches.push({ index, expected: expected.quantityValue, actual: actualQuantity });
  });
  const monetaryExact = Boolean(
    expectedAmounts &&
    expectedAmounts.length === value.items.length &&
    !amountMismatches.length &&
    !metadataMismatches.some(({ field }) => field !== 'storeName'),
  );
  const textCorrect = Boolean(
    expectedItems &&
    expectedItems.length === value.items.length &&
    !nameMismatches.length &&
    !quantityMismatches.length &&
    !metadataMismatches.some(({ field }) => field === 'storeName'),
  );
  return {
    allCorrect: value.status === 'ok' && monetaryExact && textCorrect,
    monetaryExact,
    textCorrect,
    actualItemCount: value.items.length,
    expectedItemCount: expectedAmounts?.length ?? null,
    metadataMismatches,
    amountMismatches,
    nameMismatches,
    quantityMismatches,
    typographyDifferences,
  };
};

// For invalid success arithmetic, still diagnose the unchanged answer against the photo gold.
// Structural validation is reused only to read bounded suggestions; it never changes the verdict.
export const evaluateReceiptImageSizeResponse = (raw: string, entry: ReceiptLiveCase) => {
  const validation = parseReceiptExtractionResponse(raw);
  if (validation.ok)
    return { validation, quality: evaluateReceiptImageSizeExtraction(validation.value, entry) };
  try {
    const candidate: unknown = JSON.parse(raw);
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      !('status' in candidate) ||
      candidate.status !== 'ok'
    )
      return { validation };
    const partial = parseReceiptExtractionResponse(
      JSON.stringify({
        ...candidate,
        status: 'error',
        errorReason: 'Diagnostic structural check only.',
      }),
    );
    if (partial.ok)
      return {
        validation,
        quality: { ...evaluateReceiptImageSizeExtraction(partial.value, entry), allCorrect: false },
      };
  } catch {
    /* Original validation retains the actual response error. */
  }
  return { validation };
};
