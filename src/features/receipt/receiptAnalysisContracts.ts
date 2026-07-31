// Defines strict, pure receipt-analysis result contracts independently from editable prompt text.
export const RECEIPT_ANALYSIS_LIMITS = Object.freeze({
  responseCharacters: 65_536,
  promptCharacters: 65_536,
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

export interface ReceiptTransferCategoryMapping {
  readonly transferName: string;
  readonly categoryNames: readonly string[];
}

export const DEFAULT_RECEIPT_TRANSFER_CATEGORY_MAPPINGS: readonly ReceiptTransferCategoryMapping[] =
  Object.freeze([
    Object.freeze({
      transferName: 'Lebensmittel',
      categoryNames: Object.freeze(['Einkauf', 'Lebensmittel']),
    }),
    Object.freeze({
      transferName: 'Süßwaren',
      categoryNames: Object.freeze(['Einkauf', 'Lebensmittel', 'Süßigkeiten']),
    }),
    Object.freeze({
      transferName: 'Haushaltsartikel',
      categoryNames: Object.freeze(['Einkauf', 'Haushalt']),
    }),
  ]);

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
  | 'UNKNOWN_TRANSFER_GROUP'
  | 'CATEGORY_MISMATCH'
  | 'DUPLICATE_CATEGORY'
  | 'INVALID_PROMPT_MAPPING'
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

const TRANSFER_MAPPING_LINE =
  /^\s*Transfername\s+("(?:[^"\\]|\\.)*")\s*;\s*categoryNames\s+exakt\s+(\[(?:[^\]\\]|\\.)*\])\s*\.\s*$/;

/**
 * Reads the machine-checkable mapping declarations from the editable stage-two prompt.
 * Every line mentioning either declaration marker must use the complete canonical syntax.
 */
export function parseReceiptTransferCategoryMappings(
  prompt: string,
): ReceiptAnalysisParseResult<readonly ReceiptTransferCategoryMapping[]> {
  if (prompt.length === 0 || prompt.length > RECEIPT_ANALYSIS_LIMITS.promptCharacters) {
    return failure(
      'INVALID_PROMPT_MAPPING',
      'Der Transfer-Prompt fehlt oder ist zu lang.',
      'transferPrompt',
    );
  }

  const declarationLines = prompt
    .split(/\r?\n/)
    .filter((line) => line.includes('Transfername') || /categoryNames\s+exakt/.test(line));
  if (
    declarationLines.length === 0 ||
    declarationLines.length > RECEIPT_ANALYSIS_LIMITS.transfers
  ) {
    return failure(
      'INVALID_PROMPT_MAPPING',
      'Der Transfer-Prompt muss mindestens eine gültige Gruppenzuordnung enthalten.',
      'transferPrompt',
    );
  }

  const mappings: ReceiptTransferCategoryMapping[] = [];
  for (const [index, line] of declarationLines.entries()) {
    const match = TRANSFER_MAPPING_LINE.exec(line);
    if (match === null) {
      return failure(
        'INVALID_PROMPT_MAPPING',
        'Eine Gruppenzuordnung verwendet nicht das erforderliche kanonische Format.',
        `transferPrompt.mapping[${index}]`,
      );
    }
    const transferNameJson = match[1];
    const categoryNamesJson = match[2];
    if (transferNameJson === undefined || categoryNamesJson === undefined) {
      return failure(
        'INVALID_PROMPT_MAPPING',
        'Eine Gruppenzuordnung ist unvollständig.',
        `transferPrompt.mapping[${index}]`,
      );
    }

    let transferName: unknown;
    let categoryNames: unknown;
    try {
      transferName = JSON.parse(transferNameJson);
      categoryNames = JSON.parse(categoryNamesJson);
    } catch {
      return failure(
        'INVALID_PROMPT_MAPPING',
        'Eine Gruppenzuordnung enthält ungültige JSON-Zeichenketten.',
        `transferPrompt.mapping[${index}]`,
      );
    }

    if (
      typeof transferName !== 'string' ||
      transferName.length === 0 ||
      transferName !== transferName.trim() ||
      transferName.length > RECEIPT_ANALYSIS_LIMITS.transferNameCharacters ||
      !Array.isArray(categoryNames) ||
      categoryNames.length > RECEIPT_ANALYSIS_LIMITS.categoriesPerTransfer ||
      categoryNames.some(
        (category) =>
          typeof category !== 'string' ||
          category.length === 0 ||
          category !== category.trim() ||
          category.length > RECEIPT_ANALYSIS_LIMITS.categoryNameCharacters,
      ) ||
      new Set(categoryNames).size !== categoryNames.length
    ) {
      return failure(
        'INVALID_PROMPT_MAPPING',
        'Transfername oder Kategorien der Gruppenzuordnung sind ungültig.',
        `transferPrompt.mapping[${index}]`,
      );
    }
    if (mappings.some((mapping) => mapping.transferName === transferName)) {
      return failure(
        'INVALID_PROMPT_MAPPING',
        'Ein Transfername darf im Prompt nur einmal zugeordnet werden.',
        `transferPrompt.mapping[${index}].transferName`,
      );
    }

    mappings.push({ transferName, categoryNames: [...categoryNames] as string[] });
  }

  return { ok: true, value: mappings };
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
      message: `Das Feld ${path}.${unknownKey} ist nicht erlaubt.`,
      path: `${path}.${unknownKey}`,
    };
  }

  const missingKey = expectedKeys.find((key) => !Object.hasOwn(value, key));
  return missingKey === undefined
    ? null
    : {
        code: 'INVALID_STRUCTURE',
        message: `Das Pflichtfeld ${path}.${missingKey} fehlt.`,
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
    return failure('OUTPUT_TOO_LARGE', 'Die Modellantwort überschreitet die erlaubte Größe.');
  }

  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return failure('MALFORMED_JSON', 'Die Modellantwort enthält kein gültiges JSON.');
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
      'Eine Fehlerantwort muss einen konkreten, begrenzten deutschen Grund enthalten.',
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
        'Eine Extraktions-Fehlerantwort darf keine Teilergebnisse enthalten.',
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
      'Eine Ableitungs-Fehlerantwort darf keine Teiltransfers enthalten.',
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
    return failure('INVALID_STRUCTURE', 'Die Extraktionsantwort muss ein JSON-Objekt sein.', '$');
  }

  const keysError = validateExactKeys(parsed.value, EXTRACTION_KEYS, '$');
  if (keysError !== null) return { ok: false, error: keysError };
  if (parsed.value.status !== 'ok' && parsed.value.status !== 'error') {
    return failure(
      'INVALID_STATUS',
      'Der Extraktionsstatus muss "ok" oder "error" sein.',
      '$.status',
    );
  }

  const modelError = parseModelError<ReceiptExtractionResult>(parsed.value, 'extraction');
  if (modelError !== null) return modelError;
  if (parsed.value.errorReason !== null) {
    return failure(
      'INVALID_ERROR_REASON',
      'Eine erfolgreiche Extraktion darf keinen Fehlergrund enthalten.',
      '$.errorReason',
    );
  }

  const storeName = boundedString(
    parsed.value.storeName,
    RECEIPT_ANALYSIS_LIMITS.storeNameCharacters,
  );
  if (storeName === null) {
    return failure('INVALID_STRING', 'Der Geschäftsname fehlt oder ist zu lang.', '$.storeName');
  }
  if (!isRealIsoDate(parsed.value.receiptDate)) {
    return failure(
      'INVALID_DATE',
      'Das Belegdatum ist kein echtes Datum im Format YYYY-MM-DD.',
      '$.receiptDate',
    );
  }
  if (parsed.value.currency !== 'EUR') {
    return failure(
      'INVALID_CURRENCY',
      'Es werden ausschließlich EUR-Belege unterstützt.',
      '$.currency',
    );
  }
  if (!isSafeInteger(parsed.value.receiptTotalCents) || parsed.value.receiptTotalCents <= 0) {
    return failure(
      'INVALID_CENTS',
      'Der Belegbetrag muss ein positiver sicherer Centwert sein.',
      '$.receiptTotalCents',
    );
  }
  if (
    !Array.isArray(parsed.value.items) ||
    parsed.value.items.length === 0 ||
    parsed.value.items.length > RECEIPT_ANALYSIS_LIMITS.items
  ) {
    return failure('INVALID_ITEM_COUNT', 'Die Anzahl der Bonpositionen ist ungültig.', '$.items');
  }

  const indexes = new Set<number>();
  const items: ReceiptExtractionItem[] = [];
  for (const [position, candidate] of parsed.value.items.entries()) {
    const path = `$.items[${position}]`;
    if (!isObject(candidate)) {
      return failure('INVALID_STRUCTURE', 'Jede Bonposition muss ein Objekt sein.', path);
    }
    const itemKeysError = validateExactKeys(candidate, EXTRACTION_ITEM_KEYS, path);
    if (itemKeysError !== null) return { ok: false, error: itemKeysError };
    if (!isSafeInteger(candidate.index) || candidate.index < 0) {
      return failure(
        'INVALID_STRUCTURE',
        'Der Positionsindex muss eine sichere nichtnegative Ganzzahl sein.',
        `${path}.index`,
      );
    }
    if (indexes.has(candidate.index)) {
      return failure(
        'DUPLICATE_ITEM_INDEX',
        'Jeder Positionsindex darf nur einmal vorkommen.',
        `${path}.index`,
      );
    }
    const name = boundedString(candidate.name, RECEIPT_ANALYSIS_LIMITS.itemNameCharacters);
    if (name === null) {
      return failure('INVALID_STRING', 'Der Positionsname fehlt oder ist zu lang.', `${path}.name`);
    }
    const quantityText =
      candidate.quantityText === null
        ? null
        : boundedString(candidate.quantityText, RECEIPT_ANALYSIS_LIMITS.quantityTextCharacters);
    if (candidate.quantityText !== null && quantityText === null) {
      return failure(
        'INVALID_STRING',
        'Die Mengenangabe ist leer oder zu lang.',
        `${path}.quantityText`,
      );
    }
    if (!isSafeInteger(candidate.lineTotalCents)) {
      return failure(
        'INVALID_CENTS',
        'Der Zeilenbetrag muss ein sicherer vorzeichenbehafteter Centwert sein.',
        `${path}.lineTotalCents`,
      );
    }
    if (
      typeof candidate.kind !== 'string' ||
      !ITEM_KINDS.includes(candidate.kind as ReceiptItemKind)
    ) {
      return failure('INVALID_STRUCTURE', 'Die Positionsart ist ungültig.', `${path}.kind`);
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
      'Die Summe der Bonpositionen überschreitet sichere Centgrenzen.',
      '$.items',
    );
  }
  if (itemTotal !== parsed.value.receiptTotalCents) {
    return failure(
      'ITEM_TOTAL_MISMATCH',
      'Die Summe der Bonpositionen entspricht nicht dem Belegbetrag.',
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
  categoryMappings?: readonly ReceiptTransferCategoryMapping[],
): ReceiptAnalysisParseResult<ReceiptTransferDerivationResult> {
  const parsed = parseJson(raw);
  if (!parsed.ok) return parsed;
  if (!isObject(parsed.value)) {
    return failure('INVALID_STRUCTURE', 'Die Transferantwort muss ein JSON-Objekt sein.', '$');
  }

  const keysError = validateExactKeys(parsed.value, DERIVATION_KEYS, '$');
  if (keysError !== null) return { ok: false, error: keysError };
  if (parsed.value.status !== 'ok' && parsed.value.status !== 'error') {
    return failure(
      'INVALID_STATUS',
      'Der Ableitungsstatus muss "ok" oder "error" sein.',
      '$.status',
    );
  }

  const modelError = parseModelError<ReceiptTransferDerivationResult>(parsed.value, 'derivation');
  if (modelError !== null) return modelError;
  if (parsed.value.errorReason !== null) {
    return failure(
      'INVALID_ERROR_REASON',
      'Eine erfolgreiche Ableitung darf keinen Fehlergrund enthalten.',
      '$.errorReason',
    );
  }
  if (!isSafeInteger(parsed.value.receiptTotalCents) || parsed.value.receiptTotalCents <= 0) {
    return failure(
      'INVALID_CENTS',
      'Der Transfer-Gesamtbetrag muss ein positiver sicherer Centwert sein.',
      '$.receiptTotalCents',
    );
  }
  if (parsed.value.receiptTotalCents !== extraction.receiptTotalCents) {
    return failure(
      'RECEIPT_TOTAL_MISMATCH',
      'Der abgeleitete Gesamtbetrag weicht vom Beleg ab.',
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
      'Die Anzahl der abgeleiteten Transfers ist ungültig.',
      '$.transfers',
    );
  }

  const itemByIndex = new Map(extraction.items.map((item) => [item.index, item]));
  const coveredIndexes = new Set<number>();
  const usedGroups = new Set<string>();
  const mappingByName =
    categoryMappings === undefined
      ? null
      : new Map(categoryMappings.map((mapping) => [mapping.transferName, mapping]));
  const transfers: ReceiptDerivedTransfer[] = [];

  for (const [position, candidate] of parsed.value.transfers.entries()) {
    const path = `$.transfers[${position}]`;
    if (!isObject(candidate)) {
      return failure('INVALID_STRUCTURE', 'Jeder Transfer muss ein Objekt sein.', path);
    }
    const transferKeysError = validateExactKeys(candidate, TRANSFER_KEYS, path);
    if (transferKeysError !== null) return { ok: false, error: transferKeysError };
    const name = boundedString(candidate.name, RECEIPT_ANALYSIS_LIMITS.transferNameCharacters);
    if (name === null) {
      return failure('INVALID_STRING', 'Der Transfername fehlt oder ist zu lang.', `${path}.name`);
    }
    if (usedGroups.has(name)) {
      return failure(
        'DUPLICATE_TRANSFER_GROUP',
        'Jede Transfergruppe darf nur einmal vorkommen.',
        `${path}.name`,
      );
    }
    const mapping = mappingByName?.get(name);
    if (mappingByName !== null && mapping === undefined) {
      return failure(
        'UNKNOWN_TRANSFER_GROUP',
        'Die Transfergruppe ist in den erlaubten Zuordnungen nicht enthalten.',
        `${path}.name`,
      );
    }
    if (!isSafeInteger(candidate.amountCents) || candidate.amountCents <= 0) {
      return failure(
        'INVALID_CENTS',
        'Jeder Transferbetrag muss ein positiver sicherer Centwert sein.',
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
        'Die Kategorienliste ist ungültig oder überschreitet drei Einträge.',
        `${path}.categoryNames`,
      );
    }
    if (new Set(candidate.categoryNames).size !== candidate.categoryNames.length) {
      return failure(
        'DUPLICATE_CATEGORY',
        'Eine Kategorie darf pro Transfer nur einmal vorkommen.',
        `${path}.categoryNames`,
      );
    }
    if (
      mapping !== undefined &&
      (candidate.categoryNames.length !== mapping.categoryNames.length ||
        candidate.categoryNames.some(
          (category, index) => category !== mapping.categoryNames[index],
        ))
    ) {
      return failure(
        'CATEGORY_MISMATCH',
        'Die Kategorien müssen exakt und geordnet zur Transfergruppe passen.',
        `${path}.categoryNames`,
      );
    }
    const buyplace = boundedString(candidate.buyplace, RECEIPT_ANALYSIS_LIMITS.buyplaceCharacters);
    if (buyplace === null || buyplace !== extraction.storeName) {
      return failure(
        'INVALID_STRING',
        'Der Einkaufsort muss exakt dem extrahierten Geschäft entsprechen.',
        `${path}.buyplace`,
      );
    }
    if (!isRealIsoDate(candidate.receiptDate) || candidate.receiptDate !== extraction.receiptDate) {
      return failure(
        'INVALID_DATE',
        'Das Transferdatum muss exakt dem echten Belegdatum entsprechen.',
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
        'Ein Transfer muss mindestens einen gültigen Quellindex enthalten.',
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
          'Ein Quellindex muss eine sichere nichtnegative Ganzzahl sein.',
          sourcePath,
        );
      }
      if (localIndexes.has(sourceIndex) || coveredIndexes.has(sourceIndex)) {
        return failure(
          'DUPLICATE_SOURCE_ITEM_INDEX',
          'Jeder Bonpositionsindex darf nur einmal zugeordnet werden.',
          sourcePath,
        );
      }
      const sourceItem = itemByIndex.get(sourceIndex);
      if (sourceItem === undefined) {
        return failure(
          'UNKNOWN_SOURCE_ITEM_INDEX',
          'Der Quellindex existiert nicht in der Extraktion.',
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
        'Die Gruppensumme überschreitet sichere Centgrenzen.',
        `${path}.sourceItemIndexes`,
      );
    }
    if (sourceTotal !== candidate.amountCents) {
      return failure(
        'TRANSFER_ITEM_TOTAL_MISMATCH',
        'Der Transferbetrag entspricht nicht der Summe seiner Bonpositionen.',
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
      'Nicht jede Bonposition wurde genau einmal zugeordnet.',
      '$.transfers',
    );
  }
  const transferTotal = safeCentSum(transfers.map((transfer) => transfer.amountCents));
  if (transferTotal === null) {
    return failure(
      'ARITHMETIC_OVERFLOW',
      'Die Transfersumme überschreitet sichere Centgrenzen.',
      '$.transfers',
    );
  }
  if (transferTotal !== extraction.receiptTotalCents) {
    return failure(
      'RECEIPT_TOTAL_MISMATCH',
      'Die Summe aller Transfers entspricht nicht dem Belegbetrag.',
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
