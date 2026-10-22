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
  options: { exactStoreName?: boolean; allowZeroLetter?: boolean } = {},
) => {
  const gold = entry.extraction
    ? parseReceiptExtractionResponse(JSON.stringify(entry.extraction))
    : null;
  const expectedMetadata = entry.expectedExtraction ?? (gold?.ok ? gold.value : {});
  const metadataMismatches = Object.entries(expectedMetadata)
    .filter(([key]) => !['items', 'status', 'errorReason'].includes(key))
    .flatMap(([field, expected]) => {
      const actual = value[field as keyof ReceiptExtractionResult];
      const equal =
        field === 'storeName' && !options.exactStoreName
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
  const typographyDifferences: { index: number; expected: string; actual: string }[] = [];
  const itemLabel = (label: unknown) => {
    const normalized = normalizedLabel(label);
    return options.allowZeroLetter && typeof normalized === 'string'
      ? normalized.replaceAll('0', 'O')
      : normalized;
  };
  expectedItems?.forEach((expected, index) => {
    const actual = value.items[index];
    if (itemLabel(actual?.name) !== itemLabel(expected.name))
      nameMismatches.push({ index, expected: expected.name, actual: actual?.name ?? null });
    else if (actual && actual.name !== expected.name)
      typographyDifferences.push({ index, expected: expected.name, actual: actual.name });
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
    typographyDifferences,
  };
};

// For invalid success arithmetic, still diagnose the unchanged answer against the photo gold.
// Structural validation is reused only to read bounded suggestions; it never changes the verdict.
export const evaluateReceiptImageSizeResponse = (
  raw: string,
  entry: ReceiptLiveCase,
  options: { exactStoreName?: boolean; allowZeroLetter?: boolean } = {},
) => {
  const validation = parseReceiptExtractionResponse(raw);
  if (validation.ok)
    return {
      validation,
      quality: evaluateReceiptImageSizeExtraction(validation.value, entry, options),
    };
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
        quality: {
          ...evaluateReceiptImageSizeExtraction(partial.value, entry, options),
          allCorrect: false,
        },
      };
  } catch {
    /* Original validation retains the actual response error. */
  }
  return { validation };
};
