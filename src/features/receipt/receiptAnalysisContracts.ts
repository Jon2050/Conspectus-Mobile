// Defines strict, pure receipt-analysis result contracts independently from editable prompt text.
export const RECEIPT_ANALYSIS_LIMITS = Object.freeze({
  responseCharacters: 65_536,
  items: 500,
  transfers: 100,
  errorReasonCharacters: 500,
  storeNameCharacters: 200,
  itemNameCharacters: 300,
  quantityTextCharacters: 100,
  transferNameCharacters: 200,
  categoryNameCharacters: 100,
  buyplaceCharacters: 200,
  categoriesPerTransfer: 3,
});

export type ReceiptItemKind = 'item' | 'discount' | 'deposit' | 'other';

export interface ReceiptExtractionItem {
  readonly index: number;
  readonly name: string;
  readonly quantityText: string | null;
  readonly lineTotalCents: number;
  readonly kind: ReceiptItemKind;
}

export interface ReceiptExtraction {
  readonly status: 'ok';
  readonly errorReason: null;
  readonly storeName: string;
  readonly receiptDate: string;
  readonly currency: 'EUR';
  readonly receiptTotalCents: number;
  readonly items: readonly ReceiptExtractionItem[];
}

export interface ReceiptExtractionError {
  readonly status: 'error';
  readonly errorReason: string;
  readonly storeName: null;
  readonly receiptDate: null;
  readonly currency: null;
  readonly receiptTotalCents: null;
  readonly items: readonly [];
}

export type ReceiptExtractionResult = ReceiptExtraction | ReceiptExtractionError;

export interface ReceiptDerivedTransfer {
  readonly name: string;
  readonly amountCents: number;
  readonly categoryNames: readonly string[];
  readonly buyplace: string;
  readonly receiptDate: string;
  readonly sourceItemIndexes: readonly number[];
}

export interface ReceiptTransferDerivation {
  readonly status: 'ok';
  readonly errorReason: null;
  readonly receiptTotalCents: number;
  readonly transfers: readonly ReceiptDerivedTransfer[];
}

export interface ReceiptTransferDerivationError {
  readonly status: 'error';
  readonly errorReason: string;
  readonly receiptTotalCents: null;
  readonly transfers: readonly [];
}

export type ReceiptTransferDerivationResult =
  | ReceiptTransferDerivation
  | ReceiptTransferDerivationError;

export type ReceiptAnalysisValidationErrorCode =
  | 'OUTPUT_TOO_LARGE'
  | 'MALFORMED_JSON'
  | 'INVALID_STRUCTURE'
  | 'UNKNOWN_KEY'
  | 'INVALID_STATUS'
  | 'INVALID_ERROR_REASON'
  | 'INVALID_STRING'
  | 'INVALID_DATE'
  | 'INVALID_CURRENCY'
  | 'INVALID_CENTS'
  | 'ARITHMETIC_OVERFLOW'
  | 'INVALID_ITEM_COUNT'
  | 'DUPLICATE_ITEM_INDEX'
  | 'ITEM_TOTAL_MISMATCH'
  | 'INVALID_TRANSFER_COUNT'
  | 'DUPLICATE_TRANSFER_GROUP'
  | 'DUPLICATE_CATEGORY'
  | 'DUPLICATE_SOURCE_ITEM_INDEX'
  | 'UNKNOWN_SOURCE_ITEM_INDEX'
  | 'INCOMPLETE_SOURCE_COVERAGE'
  | 'TRANSFER_ITEM_TOTAL_MISMATCH'
  | 'RECEIPT_TOTAL_MISMATCH';

export interface ReceiptAnalysisValidationError {
  readonly code: ReceiptAnalysisValidationErrorCode;
  readonly message: string;
  readonly path?: string;
}

export type ReceiptAnalysisParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ReceiptAnalysisValidationError };

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'errorReason', 'receiptTotalCents', 'transfers'],
  properties: {
    status: { type: 'string', enum: ['ok', 'error'] },
    errorReason: {
      type: ['string', 'null'],
      maxLength: RECEIPT_ANALYSIS_LIMITS.errorReasonCharacters,
    },
    receiptTotalCents: {
      type: ['integer', 'null'],
      minimum: 1,
      maximum: Number.MAX_SAFE_INTEGER,
    },
    transfers: {
      type: 'array',
      maxItems: RECEIPT_ANALYSIS_LIMITS.transfers,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name',
          'amountCents',
          'categoryNames',
          'buyplace',
          'receiptDate',
          'sourceItemIndexes',
        ],
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: RECEIPT_ANALYSIS_LIMITS.transferNameCharacters,
          },
          amountCents: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
          categoryNames: {
            type: 'array',
            maxItems: RECEIPT_ANALYSIS_LIMITS.categoriesPerTransfer,
            items: {
              type: 'string',
              minLength: 1,
              maxLength: RECEIPT_ANALYSIS_LIMITS.categoryNameCharacters,
            },
          },
          buyplace: {
            type: 'string',
            minLength: 1,
            maxLength: RECEIPT_ANALYSIS_LIMITS.buyplaceCharacters,
          },
          receiptDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          sourceItemIndexes: {
            type: 'array',
            minItems: 1,
            maxItems: RECEIPT_ANALYSIS_LIMITS.items,
            items: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
          },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

export const RECEIPT_TRANSFER_DERIVATION_JSON_SCHEMA = Object.freeze({
  name: 'receipt_transfer_derivation',
  strict: true,
  schema,
}) satisfies Readonly<Record<string, unknown>>;

const EXTRACTION_KEYS = [
  'status',
  'errorReason',
  'storeName',
  'receiptDate',
  'currency',
  'receiptTotalCents',
  'items',
] as const;
const EXTRACTION_ITEM_KEYS = ['index', 'name', 'quantityText', 'lineTotalCents', 'kind'] as const;
const DERIVATION_KEYS = ['status', 'errorReason', 'receiptTotalCents', 'transfers'] as const;
const TRANSFER_KEYS = [
  'name',
  'amountCents',
  'categoryNames',
  'buyplace',
  'receiptDate',
  'sourceItemIndexes',
] as const;
const ITEM_KINDS: readonly ReceiptItemKind[] = ['item', 'discount', 'deposit', 'other'];

type JsonObject = Record<string, unknown>;

function failure(
  code: ReceiptAnalysisValidationErrorCode,
  message: string,
  path?: string,
): ReceiptAnalysisParseResult<never> {
  return { ok: false, error: path === undefined ? { code, message } : { code, message, path } };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function validateExactKeys(
  value: JsonObject,
  expectedKeys: readonly string[],
  path: string,
): ReceiptAnalysisValidationError | null {
  const expected = new Set(expectedKeys);
  const unknownKey = Object.keys(value).find((key) => !expected.has(key));
  if (unknownKey !== undefined) {
    return {
      code: 'UNKNOWN_KEY',
      message: `Field ${path}.${unknownKey} is not allowed.`,
      path: `${path}.${unknownKey}`,
    };
  }

  const missingKey = expectedKeys.find((key) => !Object.hasOwn(value, key));
  return missingKey === undefined
    ? null
    : {
        code: 'INVALID_STRUCTURE',
        message: `Required field ${path}.${missingKey} is missing.`,
        path: `${path}.${missingKey}`,
      };
}

function boundedString(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maximum ? trimmed : null;
}

function isRealIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function safeCentSum(values: readonly number[]): number | null {
  let total = 0;
  for (const value of values) {
    const next = total + value;
    if (!Number.isSafeInteger(next)) return null;
    total = next;
  }
  return total;
}

function parseJson(raw: string): ReceiptAnalysisParseResult<unknown> {
  if (raw.length > RECEIPT_ANALYSIS_LIMITS.responseCharacters) {
    return failure('OUTPUT_TOO_LARGE', 'The model response exceeds the allowed size.');
  }

  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return failure('MALFORMED_JSON', 'The model response does not contain valid JSON.');
  }
}

function parseModelError<T>(
  value: JsonObject,
  stage: 'extraction' | 'derivation',
): ReceiptAnalysisParseResult<T> | null {
  if (value.status !== 'error') return null;
  const reason = boundedString(value.errorReason, RECEIPT_ANALYSIS_LIMITS.errorReasonCharacters);
  if (reason === null) {
    return failure(
      'INVALID_ERROR_REASON',
      'An error response must contain a concrete, bounded reason.',
      '$.errorReason',
    );
  }

  if (stage === 'extraction') {
    if (
      value.storeName !== null ||
      value.receiptDate !== null ||
      value.currency !== null ||
      value.receiptTotalCents !== null ||
      !Array.isArray(value.items) ||
      value.items.length !== 0
    ) {
      return failure(
        'INVALID_STRUCTURE',
        'An extraction error response must not contain partial results.',
      );
    }
    return {
      ok: true,
      value: {
        status: 'error',
        errorReason: reason,
        storeName: null,
        receiptDate: null,
        currency: null,
        receiptTotalCents: null,
        items: [],
      } as T,
    };
  }

  if (
    value.receiptTotalCents !== null ||
    !Array.isArray(value.transfers) ||
    value.transfers.length !== 0
  ) {
    return failure(
      'INVALID_STRUCTURE',
      'A derivation error response must not contain partial transfers.',
    );
  }
  return {
    ok: true,
    value: {
      status: 'error',
      errorReason: reason,
      receiptTotalCents: null,
      transfers: [],
    } as T,
  };
}

export function parseReceiptExtractionResponse(
  raw: string,
): ReceiptAnalysisParseResult<ReceiptExtractionResult> {
  const parsed = parseJson(raw);
  if (!parsed.ok) return parsed;
  if (!isObject(parsed.value)) {
    return failure('INVALID_STRUCTURE', 'The extraction response must be a JSON object.', '$');
  }

  const keysError = validateExactKeys(parsed.value, EXTRACTION_KEYS, '$');
  if (keysError !== null) return { ok: false, error: keysError };
  if (parsed.value.status !== 'ok' && parsed.value.status !== 'error') {
    return failure('INVALID_STATUS', 'The extraction status must be "ok" or "error".', '$.status');
  }

  const modelError = parseModelError<ReceiptExtractionResult>(parsed.value, 'extraction');
  if (modelError !== null) return modelError;
  if (parsed.value.errorReason !== null) {
    return failure(
      'INVALID_ERROR_REASON',
      'A successful extraction must not contain an error reason.',
      '$.errorReason',
    );
  }

  const storeName = boundedString(
    parsed.value.storeName,
    RECEIPT_ANALYSIS_LIMITS.storeNameCharacters,
  );
  if (storeName === null) {
    return failure('INVALID_STRING', 'The store name is missing or too long.', '$.storeName');
  }
  if (!isRealIsoDate(parsed.value.receiptDate)) {
    return failure(
      'INVALID_DATE',
      'The receipt date is not a real date in YYYY-MM-DD format.',
      '$.receiptDate',
    );
  }
  if (parsed.value.currency !== 'EUR') {
    return failure('INVALID_CURRENCY', 'Only EUR receipts are supported.', '$.currency');
  }
  if (!isSafeInteger(parsed.value.receiptTotalCents) || parsed.value.receiptTotalCents <= 0) {
    return failure(
      'INVALID_CENTS',
      'The receipt total must be a positive safe integer-cent value.',
      '$.receiptTotalCents',
    );
  }
  if (
    !Array.isArray(parsed.value.items) ||
    parsed.value.items.length === 0 ||
    parsed.value.items.length > RECEIPT_ANALYSIS_LIMITS.items
  ) {
    return failure('INVALID_ITEM_COUNT', 'The receipt item count is invalid.', '$.items');
  }

  const indexes = new Set<number>();
  const items: ReceiptExtractionItem[] = [];
  for (const [position, candidate] of parsed.value.items.entries()) {
    const path = `$.items[${position}]`;
    if (!isObject(candidate)) {
      return failure('INVALID_STRUCTURE', 'Each receipt item must be an object.', path);
    }
    const itemKeysError = validateExactKeys(candidate, EXTRACTION_ITEM_KEYS, path);
    if (itemKeysError !== null) return { ok: false, error: itemKeysError };
    if (!isSafeInteger(candidate.index) || candidate.index < 0) {
      return failure(
        'INVALID_STRUCTURE',
        'The item index must be a safe non-negative integer.',
        `${path}.index`,
      );
    }
    if (indexes.has(candidate.index)) {
      return failure(
        'DUPLICATE_ITEM_INDEX',
        'Each item index may occur only once.',
        `${path}.index`,
      );
    }
    const name = boundedString(candidate.name, RECEIPT_ANALYSIS_LIMITS.itemNameCharacters);
    if (name === null) {
      return failure('INVALID_STRING', 'The item name is missing or too long.', `${path}.name`);
    }
    const quantityText =
      candidate.quantityText === null
        ? null
        : boundedString(candidate.quantityText, RECEIPT_ANALYSIS_LIMITS.quantityTextCharacters);
    if (candidate.quantityText !== null && quantityText === null) {
      return failure(
        'INVALID_STRING',
        'The quantity text is empty or too long.',
        `${path}.quantityText`,
      );
    }
    if (!isSafeInteger(candidate.lineTotalCents)) {
      return failure(
        'INVALID_CENTS',
        'The line total must be a safe signed integer-cent value.',
        `${path}.lineTotalCents`,
      );
    }
    if (
      typeof candidate.kind !== 'string' ||
      !ITEM_KINDS.includes(candidate.kind as ReceiptItemKind)
    ) {
      return failure('INVALID_STRUCTURE', 'The item kind is invalid.', `${path}.kind`);
    }

    indexes.add(candidate.index);
    items.push({
      index: candidate.index,
      name,
      quantityText,
      lineTotalCents: candidate.lineTotalCents,
      kind: candidate.kind as ReceiptItemKind,
    });
  }

  const itemTotal = safeCentSum(items.map((item) => item.lineTotalCents));
  if (itemTotal === null) {
    return failure(
      'ARITHMETIC_OVERFLOW',
      'The receipt item sum exceeds safe integer-cent bounds.',
      '$.items',
    );
  }
  if (itemTotal !== parsed.value.receiptTotalCents) {
    return failure(
      'ITEM_TOTAL_MISMATCH',
      'The receipt item sum does not match the receipt total.',
      '$.items',
    );
  }

  return {
    ok: true,
    value: {
      status: 'ok',
      errorReason: null,
      storeName,
      receiptDate: parsed.value.receiptDate,
      currency: 'EUR',
      receiptTotalCents: parsed.value.receiptTotalCents,
      items,
    },
  };
}

export function parseReceiptTransferDerivationResponse(
  raw: string,
  extraction: ReceiptExtraction,
): ReceiptAnalysisParseResult<ReceiptTransferDerivationResult> {
  const parsed = parseJson(raw);
  if (!parsed.ok) return parsed;
  if (!isObject(parsed.value)) {
    return failure('INVALID_STRUCTURE', 'The transfer response must be a JSON object.', '$');
  }

  const keysError = validateExactKeys(parsed.value, DERIVATION_KEYS, '$');
  if (keysError !== null) return { ok: false, error: keysError };
  if (parsed.value.status !== 'ok' && parsed.value.status !== 'error') {
    return failure('INVALID_STATUS', 'The derivation status must be "ok" or "error".', '$.status');
  }

  const modelError = parseModelError<ReceiptTransferDerivationResult>(parsed.value, 'derivation');
  if (modelError !== null) return modelError;
  if (parsed.value.errorReason !== null) {
    return failure(
      'INVALID_ERROR_REASON',
      'A successful derivation must not contain an error reason.',
      '$.errorReason',
    );
  }
  if (!isSafeInteger(parsed.value.receiptTotalCents) || parsed.value.receiptTotalCents <= 0) {
    return failure(
      'INVALID_CENTS',
      'The derived receipt total must be a positive safe integer-cent value.',
      '$.receiptTotalCents',
    );
  }
  if (parsed.value.receiptTotalCents !== extraction.receiptTotalCents) {
    return failure(
      'RECEIPT_TOTAL_MISMATCH',
      'The derived receipt total does not match the extraction.',
      '$.receiptTotalCents',
    );
  }
  if (
    !Array.isArray(parsed.value.transfers) ||
    parsed.value.transfers.length === 0 ||
    parsed.value.transfers.length > RECEIPT_ANALYSIS_LIMITS.transfers
  ) {
    return failure(
      'INVALID_TRANSFER_COUNT',
      'The number of derived transfers is invalid.',
      '$.transfers',
    );
  }

  const itemByIndex = new Map(extraction.items.map((item) => [item.index, item]));
  const coveredIndexes = new Set<number>();
  const usedGroups = new Set<string>();
  const transfers: ReceiptDerivedTransfer[] = [];

  for (const [position, candidate] of parsed.value.transfers.entries()) {
    const path = `$.transfers[${position}]`;
    if (!isObject(candidate)) {
      return failure('INVALID_STRUCTURE', 'Each transfer must be an object.', path);
    }
    const transferKeysError = validateExactKeys(candidate, TRANSFER_KEYS, path);
    if (transferKeysError !== null) return { ok: false, error: transferKeysError };
    const name = boundedString(candidate.name, RECEIPT_ANALYSIS_LIMITS.transferNameCharacters);
    if (name === null) {
      return failure('INVALID_STRING', 'The transfer name is missing or too long.', `${path}.name`);
    }
    if (usedGroups.has(name)) {
      return failure(
        'DUPLICATE_TRANSFER_GROUP',
        'Each transfer name may occur only once.',
        `${path}.name`,
      );
    }
    if (!isSafeInteger(candidate.amountCents) || candidate.amountCents <= 0) {
      return failure(
        'INVALID_CENTS',
        'Each transfer amount must be a positive safe integer-cent value.',
        `${path}.amountCents`,
      );
    }
    if (
      !Array.isArray(candidate.categoryNames) ||
      candidate.categoryNames.length > RECEIPT_ANALYSIS_LIMITS.categoriesPerTransfer ||
      candidate.categoryNames.some(
        (category) =>
          boundedString(category, RECEIPT_ANALYSIS_LIMITS.categoryNameCharacters) === null,
      )
    ) {
      return failure(
        'INVALID_STRUCTURE',
        'The category list is invalid or exceeds three entries.',
        `${path}.categoryNames`,
      );
    }
    if (new Set(candidate.categoryNames).size !== candidate.categoryNames.length) {
      return failure(
        'DUPLICATE_CATEGORY',
        'A category may occur only once per transfer.',
        `${path}.categoryNames`,
      );
    }
    const buyplace = boundedString(candidate.buyplace, RECEIPT_ANALYSIS_LIMITS.buyplaceCharacters);
    if (buyplace === null || buyplace !== extraction.storeName) {
      return failure(
        'INVALID_STRING',
        'The purchase location must exactly match the extracted store name.',
        `${path}.buyplace`,
      );
    }
    if (!isRealIsoDate(candidate.receiptDate) || candidate.receiptDate !== extraction.receiptDate) {
      return failure(
        'INVALID_DATE',
        'The transfer date must exactly match the validated receipt date.',
        `${path}.receiptDate`,
      );
    }
    if (
      !Array.isArray(candidate.sourceItemIndexes) ||
      candidate.sourceItemIndexes.length === 0 ||
      candidate.sourceItemIndexes.length > RECEIPT_ANALYSIS_LIMITS.items
    ) {
      return failure(
        'INVALID_STRUCTURE',
        'A transfer must contain at least one valid source item index.',
        `${path}.sourceItemIndexes`,
      );
    }

    const localIndexes = new Set<number>();
    const sourceAmounts: number[] = [];
    for (const [sourcePosition, sourceIndex] of candidate.sourceItemIndexes.entries()) {
      const sourcePath = `${path}.sourceItemIndexes[${sourcePosition}]`;
      if (!isSafeInteger(sourceIndex) || sourceIndex < 0) {
        return failure(
          'INVALID_STRUCTURE',
          'A source item index must be a safe non-negative integer.',
          sourcePath,
        );
      }
      if (localIndexes.has(sourceIndex) || coveredIndexes.has(sourceIndex)) {
        return failure(
          'DUPLICATE_SOURCE_ITEM_INDEX',
          'Each receipt item index may be assigned only once.',
          sourcePath,
        );
      }
      const sourceItem = itemByIndex.get(sourceIndex);
      if (sourceItem === undefined) {
        return failure(
          'UNKNOWN_SOURCE_ITEM_INDEX',
          'The source item index does not exist in the extraction.',
          sourcePath,
        );
      }
      localIndexes.add(sourceIndex);
      sourceAmounts.push(sourceItem.lineTotalCents);
    }

    const sourceTotal = safeCentSum(sourceAmounts);
    if (sourceTotal === null) {
      return failure(
        'ARITHMETIC_OVERFLOW',
        'The transfer source-item sum exceeds safe integer-cent bounds.',
        `${path}.sourceItemIndexes`,
      );
    }
    if (sourceTotal !== candidate.amountCents) {
      return failure(
        'TRANSFER_ITEM_TOTAL_MISMATCH',
        'The transfer amount does not match the sum of its source items.',
        `${path}.amountCents`,
      );
    }

    for (const sourceIndex of localIndexes) coveredIndexes.add(sourceIndex);
    usedGroups.add(name);
    transfers.push({
      name,
      amountCents: candidate.amountCents,
      categoryNames: [...candidate.categoryNames] as string[],
      buyplace,
      receiptDate: candidate.receiptDate,
      sourceItemIndexes: [...candidate.sourceItemIndexes] as number[],
    });
  }

  if (coveredIndexes.size !== itemByIndex.size) {
    return failure(
      'INCOMPLETE_SOURCE_COVERAGE',
      'Not every receipt item was assigned exactly once.',
      '$.transfers',
    );
  }
  const transferTotal = safeCentSum(transfers.map((transfer) => transfer.amountCents));
  if (transferTotal === null) {
    return failure(
      'ARITHMETIC_OVERFLOW',
      'The transfer sum exceeds safe integer-cent bounds.',
      '$.transfers',
    );
  }
  if (transferTotal !== extraction.receiptTotalCents) {
    return failure(
      'RECEIPT_TOTAL_MISMATCH',
      'The sum of all transfers does not match the receipt total.',
      '$.transfers',
    );
  }

  return {
    ok: true,
    value: {
      status: 'ok',
      errorReason: null,
      receiptTotalCents: extraction.receiptTotalCents,
      transfers,
    },
  };
}
