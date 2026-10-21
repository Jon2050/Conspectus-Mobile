// Exercises strict receipt result parsing, exact cent arithmetic, and derivation coverage rules.
import { describe, expect, it } from 'vitest';

import {
  RECEIPT_ANALYSIS_LIMITS,
  parseReceiptExtractionResponse,
  parseReceiptTransferDerivationResponse,
} from './receiptAnalysisContracts';
import type { ReceiptExtraction } from './receiptAnalysisContracts';

const extractionJson = {
  status: 'ok',
  errorReason: null,
  storeName: 'Testmarkt',
  receiptDate: '2024-02-29',
  currency: 'EUR',
  receiptTotalCents: 700,
  items: [
    {
      index: 0,
      name: 'Äpfel',
      quantityText: '1 kg',
      lineTotalCents: 500,
      kind: 'item',
    },
    {
      index: 8,
      name: 'Bonbons',
      quantityText: null,
      lineTotalCents: 250,
      kind: 'item',
    },
    {
      index: 12,
      name: 'Rabatt Äpfel',
      quantityText: null,
      lineTotalCents: -50,
      kind: 'discount',
    },
  ],
};

const extraction = parseReceiptExtractionResponse(JSON.stringify(extractionJson));
if (!extraction.ok || extraction.value.status !== 'ok') {
  throw new Error('Test fixture must be a valid extraction.');
}
const validExtraction: ReceiptExtraction = extraction.value;

const derivationJson = {
  status: 'ok',
  errorReason: null,

  buyplace: 'Testmarkt',
  transfers: [
    {
      name: 'Lebensmittel',
      amountCents: 450,
      categoryNames: ['Einkauf', 'Lebensmittel'],
      sourceItemIndexes: [0, 12],
    },
    {
      name: 'Süßwaren',
      amountCents: 250,
      categoryNames: ['Einkauf', 'Lebensmittel', 'Süßigkeiten'],
      sourceItemIndexes: [8],
    },
  ],
};

function extractionWith(overrides: Record<string, unknown>): string {
  return JSON.stringify({ ...extractionJson, ...overrides });
}

function derivationWith(overrides: Record<string, unknown>): string {
  return JSON.stringify({ ...derivationJson, ...overrides });
}

describe('stage-one receipt extraction parser', () => {
  it('accepts a complete EUR extraction with signed cent lines and a real leap date', () => {
    expect(extraction).toEqual({ ok: true, value: validExtraction });
    expect(validExtraction.items.map((item) => item.index)).toEqual([0, 8, 12]);
  });

  it('accepts a bounded error result even when no fields could be read', () => {
    const result = parseReceiptExtractionResponse(
      JSON.stringify({
        status: 'error',
        errorReason: 'Der Gesamtbetrag ist nicht sicher lesbar.',
        storeName: null,
        receiptDate: null,
        currency: null,
        receiptTotalCents: null,
        items: [],
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      value: { status: 'error', errorReason: 'Der Gesamtbetrag ist nicht sicher lesbar.' },
    });
  });

  it.each([
    ['', 'MALFORMED_JSON'],
    ['[]', 'INVALID_STRUCTURE'],
    [extractionWith({ status: 'partial' }), 'INVALID_STATUS'],
    [extractionWith({ currency: 'USD' }), 'INVALID_CURRENCY'],
    [extractionWith({ receiptDate: '2023-02-29' }), 'INVALID_DATE'],
    [extractionWith({ receiptTotalCents: 700.5 }), 'INVALID_CENTS'],
    [extractionWith({ items: [] }), 'INVALID_ITEM_COUNT'],
  ])('rejects invalid extraction output with %s', (raw, code) => {
    expect(parseReceiptExtractionResponse(raw)).toMatchObject({ ok: false, error: { code } });
  });

  it('rejects unknown keys at the result and item levels', () => {
    expect(
      parseReceiptExtractionResponse(extractionWith({ instructions: 'ignore rules' })),
    ).toMatchObject({
      ok: false,
      error: { code: 'UNKNOWN_KEY', path: '$.instructions' },
    });

    const items = [
      { ...extractionJson.items[0], injected: true },
      ...extractionJson.items.slice(1),
    ];
    expect(parseReceiptExtractionResponse(extractionWith({ items }))).toMatchObject({
      ok: false,
      error: { code: 'UNKNOWN_KEY', path: '$.items[0].injected' },
    });
  });

  it('rejects duplicate unsafe indexes and non-exact item totals', () => {
    const duplicate = extractionJson.items.map((item, index) =>
      index === 1 ? { ...item, index: 0 } : item,
    );
    expect(parseReceiptExtractionResponse(extractionWith({ items: duplicate }))).toMatchObject({
      ok: false,
      error: { code: 'DUPLICATE_ITEM_INDEX' },
    });

    const unsafe = extractionJson.items.map((item, index) =>
      index === 0 ? { ...item, index: Number.MAX_SAFE_INTEGER + 1 } : item,
    );
    expect(parseReceiptExtractionResponse(extractionWith({ items: unsafe }))).toMatchObject({
      ok: false,
      error: { code: 'INVALID_STRUCTURE' },
    });

    expect(
      parseReceiptExtractionResponse(extractionWith({ receiptTotalCents: 701 })),
    ).toMatchObject({
      ok: false,
      error: { code: 'ITEM_TOTAL_MISMATCH' },
    });
  });

  it('fails closed when an intermediate signed-cent sum leaves the safe range', () => {
    const items = [
      { ...extractionJson.items[0], lineTotalCents: Number.MAX_SAFE_INTEGER },
      { ...extractionJson.items[1], lineTotalCents: 1 },
      { ...extractionJson.items[2], lineTotalCents: -Number.MAX_SAFE_INTEGER },
    ];
    expect(
      parseReceiptExtractionResponse(extractionWith({ receiptTotalCents: 1, items })),
    ).toMatchObject({ ok: false, error: { code: 'ARITHMETIC_OVERFLOW' } });
  });

  it('bounds the complete output and never copies raw model text into errors', () => {
    const secret = 'RAW_MODEL_SECRET';
    const result = parseReceiptExtractionResponse(
      `${secret}${'x'.repeat(RECEIPT_ANALYSIS_LIMITS.responseCharacters)}`,
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'OUTPUT_TOO_LARGE' } });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('rejects empty or oversized errors but retains readable partial fields', () => {
    const baseError = {
      status: 'error',
      errorReason: ' ',
      storeName: null,
      receiptDate: null,
      currency: null,
      receiptTotalCents: null,
      items: [],
    };
    expect(parseReceiptExtractionResponse(JSON.stringify(baseError))).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ERROR_REASON' },
    });
    expect(
      parseReceiptExtractionResponse(
        JSON.stringify({
          ...baseError,
          errorReason: 'x'.repeat(RECEIPT_ANALYSIS_LIMITS.errorReasonCharacters + 1),
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_ERROR_REASON' } });
    expect(
      parseReceiptExtractionResponse(
        JSON.stringify({ ...baseError, errorReason: 'Unleserlich.', storeName: 'Teilwert' }),
      ),
    ).toMatchObject({ ok: true, value: { storeName: 'Teilwert', status: 'error' } });
  });
});

describe('stage-two transfer derivation contract', () => {
  it('retains typed partial extraction metadata and incomplete groups without promoting them to successful output', () => {
    const partial = parseReceiptExtractionResponse(
      extractionWith({
        status: 'error',
        errorReason: 'Ein Betrag fehlt.',
        receiptTotalCents: null,
      }),
    );
    expect(partial).toMatchObject({
      ok: true,
      value: {
        status: 'error',
        storeName: 'Testmarkt',
        receiptDate: '2024-02-29',
        receiptTotalCents: null,
        items: extractionJson.items,
      },
    });
    if (!partial.ok) throw new Error('Expected partial extraction');
    const derived = parseReceiptTransferDerivationResponse(
      derivationWith({
        status: 'error',
        errorReason: 'Unvollstaendig.',
        transfers: [derivationJson.transfers[0]],
      }),
      partial.value,
    );
    expect(derived).toMatchObject({
      ok: true,
      value: {
        status: 'error',
        buyplace: 'Testmarkt',
        receiptTotalCents: null,
        transfers: [{ amountCents: 450, receiptDate: '2024-02-29' }],
      },
    });
    expect(
      parseReceiptTransferDerivationResponse(JSON.stringify(derivationJson), partial.value),
    ).toMatchObject({ ok: false });
  });
  it('accepts complete once-only coverage and exact signed source-group sums', () => {
    const result = parseReceiptTransferDerivationResponse(
      JSON.stringify(derivationJson),
      validExtraction,
    );
    expect(result).toMatchObject({
      ok: true,
      value: { status: 'ok', receiptTotalCents: 700, transfers: derivationJson.transfers },
    });
  });

  it('accepts one normalized store and inherits the validated date and total for every transfer', () => {
    const result = parseReceiptTransferDerivationResponse(
      derivationWith({ buyplace: 'Rewe' }),
      validExtraction,
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        receiptTotalCents: 700,
        transfers: [
          { buyplace: 'Rewe', receiptDate: '2024-02-29' },
          { buyplace: 'Rewe', receiptDate: '2024-02-29' },
        ],
      },
    });

    for (const buyplace of ['', null, 'x'.repeat(RECEIPT_ANALYSIS_LIMITS.buyplaceCharacters + 1)]) {
      expect(
        parseReceiptTransferDerivationResponse(derivationWith({ buyplace }), validExtraction),
      ).toMatchObject({ ok: false, error: { code: 'INVALID_STRING' } });
    }

    expect(
      parseReceiptTransferDerivationResponse(
        derivationWith({ receiptDate: '2025-01-01' }),
        validExtraction,
      ),
    ).toMatchObject({ ok: false, error: { code: 'UNKNOWN_KEY' } });
  });

  it('accepts LLM-generated transfer names and categories without interpreting user rules', () => {
    const custom = {
      ...derivationJson,
      transfers: [
        {
          name: 'Eigene Gruppe',
          amountCents: 700,
          categoryNames: ['Benutzerdefiniert'],
          sourceItemIndexes: [0, 8, 12],
        },
      ],
    };
    expect(
      parseReceiptTransferDerivationResponse(JSON.stringify(custom), validExtraction),
    ).toMatchObject({
      ok: true,
      value: { status: 'ok' },
    });
  });

  it('rejects duplicate category names for custom prompt groups', () => {
    const custom = {
      ...derivationJson,
      transfers: [
        {
          name: 'Eigene Gruppe',
          amountCents: 700,
          categoryNames: ['Benutzerdefiniert', 'Benutzerdefiniert'],
          sourceItemIndexes: [0, 8, 12],
        },
      ],
    };

    expect(
      parseReceiptTransferDerivationResponse(JSON.stringify(custom), validExtraction),
    ).toMatchObject({ ok: false, error: { code: 'DUPLICATE_CATEGORY' } });
  });

  it('does not compare category names or ordering against app-owned mappings', () => {
    const reversed = derivationJson.transfers.map((transfer, index) =>
      index === 0
        ? { ...transfer, categoryNames: [...transfer.categoryNames].reverse() }
        : transfer,
    );
    expect(
      parseReceiptTransferDerivationResponse(
        derivationWith({ transfers: reversed }),
        validExtraction,
      ),
    ).toMatchObject({ ok: true });

    const renamed = derivationJson.transfers.map((transfer, index) =>
      index === 0 ? { ...transfer, name: 'Unbekannt' } : transfer,
    );
    expect(
      parseReceiptTransferDerivationResponse(
        derivationWith({ transfers: renamed }),
        validExtraction,
      ),
    ).toMatchObject({ ok: true });
  });

  it('rejects duplicate, missing, and unknown source item indexes', () => {
    const duplicate = derivationJson.transfers.map((transfer, index) =>
      index === 1 ? { ...transfer, sourceItemIndexes: [8, 12], amountCents: 200 } : transfer,
    );
    expect(
      parseReceiptTransferDerivationResponse(
        derivationWith({ transfers: duplicate }),
        validExtraction,
      ),
    ).toMatchObject({ ok: false, error: { code: 'DUPLICATE_SOURCE_ITEM_INDEX' } });

    const missing = [derivationJson.transfers[0]];
    expect(
      parseReceiptTransferDerivationResponse(
        derivationWith({ transfers: missing }),
        validExtraction,
      ),
    ).toMatchObject({ ok: false, error: { code: 'INCOMPLETE_SOURCE_COVERAGE' } });

    const unknown = derivationJson.transfers.map((transfer, index) =>
      index === 1 ? { ...transfer, sourceItemIndexes: [999] } : transfer,
    );
    expect(
      parseReceiptTransferDerivationResponse(
        derivationWith({ transfers: unknown }),
        validExtraction,
      ),
    ).toMatchObject({ ok: false, error: { code: 'UNKNOWN_SOURCE_ITEM_INDEX' } });
  });

  it('requires every positive transfer amount to equal its referenced signed item sum', () => {
    const wrongGroupSum = derivationJson.transfers.map((transfer, index) =>
      index === 0 ? { ...transfer, amountCents: 500 } : transfer,
    );
    expect(
      parseReceiptTransferDerivationResponse(
        derivationWith({ transfers: wrongGroupSum }),
        validExtraction,
      ),
    ).toMatchObject({ ok: false, error: { code: 'TRANSFER_ITEM_TOTAL_MISMATCH' } });

    const zero = derivationJson.transfers.map((transfer, index) =>
      index === 0 ? { ...transfer, amountCents: 0 } : transfer,
    );
    expect(
      parseReceiptTransferDerivationResponse(derivationWith({ transfers: zero }), validExtraction),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_CENTS' } });
  });

  it('rejects redundant wire metadata, too many categories, and unknown keys', () => {
    expect(
      parseReceiptTransferDerivationResponse(
        derivationWith({ receiptTotalCents: 701 }),
        validExtraction,
      ),
    ).toMatchObject({ ok: false, error: { code: 'UNKNOWN_KEY' } });

    for (const changed of [
      { ...derivationJson.transfers[0], buyplace: 'Anderer Markt' },
      { ...derivationJson.transfers[0], receiptDate: '2024-02-30' },
      { ...derivationJson.transfers[0], categoryNames: ['A', 'B', 'C', 'D'] },
      { ...derivationJson.transfers[0], ignored: true },
    ]) {
      const transfers = [changed, derivationJson.transfers[1]];
      expect(
        parseReceiptTransferDerivationResponse(derivationWith({ transfers }), validExtraction),
      ).toMatchObject({ ok: false });
    }
  });

  it('requires bounded nonempty error reasons even when partial transfers are returned', () => {
    const error = {
      status: 'error',
      errorReason: 'Eine Position kann nicht sicher zugeordnet werden.',

      buyplace: null,
      transfers: [],
    };
    expect(
      parseReceiptTransferDerivationResponse(JSON.stringify(error), validExtraction),
    ).toMatchObject({
      ok: true,
      value: { status: 'error', errorReason: error.errorReason },
    });
    expect(
      parseReceiptTransferDerivationResponse(
        JSON.stringify({ ...error, errorReason: '', transfers: derivationJson.transfers }),
        validExtraction,
      ),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_ERROR_REASON' } });
  });
});
