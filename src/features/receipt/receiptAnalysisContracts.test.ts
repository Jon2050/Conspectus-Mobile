// Exercises strict receipt result parsing, exact cent arithmetic, and derivation coverage rules.
import { describe, expect, it } from 'vitest';

import {
  RECEIPT_ANALYSIS_LIMITS,
  receiptExtractionData,
  parseReceiptExtractionResponse,
  parseReceiptTransferDerivationResponse,
} from './receiptAnalysisContracts';
import type { ReceiptExtraction } from './receiptAnalysisContracts';

const extractionJson = {
  status: 'ok',
  errorReason: null,
  storeName: 'Testmarkt',
  receiptDate: '2024-02-29',
  receiptTotal: '7,00',
  items: [
    {
      index: 0,
      name: 'Äpfel',
      lineTotal: '5,00',
    },
    {
      index: 8,
      name: 'Bonbons',
      lineTotal: '2,50',
    },
    {
      index: 12,
      name: 'Rabatt Äpfel',
      lineTotal: '-0,50',
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
  groups: [
    {
      name: 'Lebensmittel',
      categoryNames: ['Einkauf', 'Lebensmittel'],
      sourceItemIndexes: [0, 12],
    },
    {
      name: 'Süßwaren',
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
  it('accepts a complete extraction with signed decimal-comma amounts and a real leap date', () => {
    expect(extraction).toEqual({ ok: true, value: validExtraction });
    expect(validExtraction.items.map((item) => item.index)).toEqual([0, 8, 12]);
  });

  it.each([
    '5.46',
    '5,4',
    '5,460',
    '5,46 €',
    ' 5,46',
    '1.000,00',
    '1e2',
    '+5,46',
    5.46,
    '90071992547409,92',
  ])('rejects noncanonical or unsafe amounts: %s', (amount) => {
    expect(parseReceiptExtractionResponse(extractionWith({ receiptTotal: amount }))).toMatchObject({
      ok: false,
      error: { code: 'INVALID_AMOUNT' },
    });
    expect(
      parseReceiptExtractionResponse(
        extractionWith({ items: [{ ...extractionJson.items[0], lineTotal: amount }] }),
      ),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_AMOUNT' } });
  });

  it('converts signed final amounts exactly and round-trips the reduced wire contract', () => {
    expect(validExtraction.receiptTotalCents).toBe(700);
    expect(validExtraction.items.map((item) => item.lineTotalCents)).toEqual([500, 250, -50]);
    expect(receiptExtractionData(validExtraction)).toEqual(extractionJson);
    for (const [field, value] of [
      ['currency', 'EUR'],
      ['receiptTotalCents', 700],
    ]) {
      expect(
        parseReceiptExtractionResponse(extractionWith({ [field as string]: value })),
      ).toMatchObject({ ok: false, error: { code: 'UNKNOWN_KEY' } });
    }
    for (const field of ['quantityText', 'quantityLine', 'kind', 'lineTotalCents']) {
      expect(
        parseReceiptExtractionResponse(
          extractionWith({ items: [{ ...extractionJson.items[0], [field]: null }] }),
        ),
      ).toMatchObject({ ok: false, error: { code: 'UNKNOWN_KEY' } });
    }
  });

  it('accepts a bounded error result even when no fields could be read', () => {
    const result = parseReceiptExtractionResponse(
      JSON.stringify({
        status: 'error',
        errorReason: 'Der Gesamtbetrag ist nicht sicher lesbar.',
        storeName: null,
        receiptDate: null,
        receiptTotal: null,
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
    [extractionWith({ receiptDate: '2023-02-29' }), 'INVALID_DATE'],
    [extractionWith({ receiptTotal: 7.005 }), 'INVALID_AMOUNT'],
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

    expect(parseReceiptExtractionResponse(extractionWith({ receiptTotal: '7,01' }))).toMatchObject({
      ok: false,
      error: { code: 'ITEM_TOTAL_MISMATCH' },
    });
  });

  it('fails closed when an intermediate signed-cent sum leaves the safe range', () => {
    const items = [
      { ...extractionJson.items[0], lineTotal: '90071992547409,91' },
      { ...extractionJson.items[1], lineTotal: '0,01' },
      { ...extractionJson.items[2], lineTotal: '-90071992547409,91' },
    ];
    expect(
      parseReceiptExtractionResponse(extractionWith({ receiptTotal: '0,01', items })),
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
      receiptTotal: null,
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
  it('accepts a single complete group and converts it into one local booking entry', () => {
    const raw = derivationWith({
      groups: [
        { name: 'Eine Gruppe', categoryNames: ['Eigene Kategorie'], sourceItemIndexes: [0, 8, 12] },
      ],
    });
    const parsed = parseReceiptTransferDerivationResponse(raw, validExtraction);
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        transfers: [
          {
            name: 'Eine Gruppe',
            amountCents: 700,
            categoryNames: ['Eigene Kategorie'],
            sourceItemIndexes: [0, 8, 12],
          },
        ],
      },
    });
    if (!parsed.ok) throw new Error('Expected a complete group');
    expect(parsed.value.transfers).toHaveLength(1);
  });

  it.each(['ok', 'error'])('rejects the old transfers wire key for status %s', (status) => {
    const { groups, ...metadata } = derivationJson;
    expect(
      parseReceiptTransferDerivationResponse(
        JSON.stringify({
          ...metadata,
          status,
          errorReason: status === 'ok' ? null : 'Teilantwort.',
          transfers: groups,
        }),
        validExtraction,
      ),
    ).toMatchObject({ ok: false, error: { code: 'UNKNOWN_KEY', path: '$.transfers' } });
  });

  it('retains typed partial extraction metadata and incomplete groups without promoting them to successful output', () => {
    const partial = parseReceiptExtractionResponse(
      extractionWith({
        status: 'error',
        errorReason: 'Ein Betrag fehlt.',
        receiptTotal: null,
      }),
    );
    expect(partial).toMatchObject({
      ok: true,
      value: {
        status: 'error',
        storeName: 'Testmarkt',
        receiptDate: '2024-02-29',
        receiptTotalCents: null,
        items: validExtraction.items,
      },
    });
    if (!partial.ok) throw new Error('Expected partial extraction');
    const derived = parseReceiptTransferDerivationResponse(
      derivationWith({
        status: 'error',
        errorReason: 'Unvollstaendig.',
        groups: [derivationJson.groups[0]],
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
      value: {
        status: 'ok',
        receiptTotalCents: 700,
        transfers: [
          { ...derivationJson.groups[0], amountCents: 450 },
          { ...derivationJson.groups[1], amountCents: 250 },
        ],
      },
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
      groups: [
        {
          name: 'Eigene Gruppe',
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
      groups: [
        {
          name: 'Eigene Gruppe',
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
    const reversed = derivationJson.groups.map((transfer, index) =>
      index === 0
        ? { ...transfer, categoryNames: [...transfer.categoryNames].reverse() }
        : transfer,
    );
    expect(
      parseReceiptTransferDerivationResponse(derivationWith({ groups: reversed }), validExtraction),
    ).toMatchObject({ ok: true });

    const renamed = derivationJson.groups.map((transfer, index) =>
      index === 0 ? { ...transfer, name: 'Unbekannt' } : transfer,
    );
    expect(
      parseReceiptTransferDerivationResponse(derivationWith({ groups: renamed }), validExtraction),
    ).toMatchObject({ ok: true });
  });

  it('rejects duplicate, missing, and unknown source item indexes', () => {
    const duplicate = derivationJson.groups.map((transfer, index) =>
      index === 1 ? { ...transfer, sourceItemIndexes: [8, 12] } : transfer,
    );
    expect(
      parseReceiptTransferDerivationResponse(
        derivationWith({ groups: duplicate }),
        validExtraction,
      ),
    ).toMatchObject({ ok: false, error: { code: 'DUPLICATE_SOURCE_ITEM_INDEX' } });

    const missing = [derivationJson.groups[0]];
    expect(
      parseReceiptTransferDerivationResponse(derivationWith({ groups: missing }), validExtraction),
    ).toMatchObject({ ok: false, error: { code: 'INCOMPLETE_SOURCE_COVERAGE' } });

    const unknown = derivationJson.groups.map((transfer, index) =>
      index === 1 ? { ...transfer, sourceItemIndexes: [999] } : transfer,
    );
    expect(
      parseReceiptTransferDerivationResponse(derivationWith({ groups: unknown }), validExtraction),
    ).toMatchObject({ ok: false, error: { code: 'UNKNOWN_SOURCE_ITEM_INDEX' } });
  });

  it('rejects legacy model amounts and computes positive groups locally', () => {
    const legacy = [{ ...derivationJson.groups[0], amountCents: 450 }, derivationJson.groups[1]];
    expect(
      parseReceiptTransferDerivationResponse(derivationWith({ groups: legacy }), validExtraction),
    ).toMatchObject({ ok: false, error: { code: 'UNKNOWN_KEY' } });
    const negative = [
      { ...derivationJson.groups[0], sourceItemIndexes: [12] },
      { ...derivationJson.groups[1], sourceItemIndexes: [0, 8] },
    ];
    expect(
      parseReceiptTransferDerivationResponse(derivationWith({ groups: negative }), validExtraction),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_CENTS' } });
  });

  it.each([[], [999], [0, 999], [0, 0]].map((indexes) => ({ indexes })))(
    'never invents partial amounts for invalid references %j',
    ({ indexes }) => {
      const raw = derivationWith({
        status: 'error',
        errorReason: 'Teilantwort.',
        groups: [{ ...derivationJson.groups[0], sourceItemIndexes: indexes }],
      });
      expect(parseReceiptTransferDerivationResponse(raw, validExtraction)).toMatchObject({
        ok: false,
      });
    },
  );

  it('rejects zero complete groups, retains zero only as a partial suggestion and checks the receipt total', () => {
    const receipt: ReceiptExtraction = {
      ...validExtraction,
      receiptTotalCents: 100,
      items: [
        { ...validExtraction.items[0]!, index: 0, lineTotalCents: 50 },
        { ...validExtraction.items[0]!, index: 1, lineTotalCents: -50 },
        { ...validExtraction.items[0]!, index: 2, lineTotalCents: 100 },
      ],
    };
    const transfers = [
      { ...derivationJson.groups[0], sourceItemIndexes: [0, 1] },
      { ...derivationJson.groups[1], sourceItemIndexes: [2] },
    ];
    expect(
      parseReceiptTransferDerivationResponse(derivationWith({ groups: transfers }), receipt),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_CENTS' } });
    expect(
      parseReceiptTransferDerivationResponse(
        derivationWith({ groups: transfers, status: 'error', errorReason: 'Nullgruppe.' }),
        receipt,
      ),
    ).toMatchObject({
      ok: true,
      value: { status: 'error', transfers: [{ amountCents: 0 }, { amountCents: 100 }] },
    });
    expect(
      parseReceiptTransferDerivationResponse(
        derivationWith({ groups: [{ ...transfers[0], sourceItemIndexes: [0, 1, 2] }] }),
        { ...receipt, receiptTotalCents: 101 },
      ),
    ).toMatchObject({ ok: false, error: { code: 'RECEIPT_TOTAL_MISMATCH' } });
  });

  it('checks intermediate overflow even when a reordered group has a safe final sum', () => {
    const huge: ReceiptExtraction = {
      ...validExtraction,
      receiptTotalCents: 1,
      items: [
        { ...validExtraction.items[0]!, index: 0, lineTotalCents: Number.MAX_SAFE_INTEGER },
        { ...validExtraction.items[0]!, index: 1, lineTotalCents: -Number.MAX_SAFE_INTEGER },
        { ...validExtraction.items[0]!, index: 2, lineTotalCents: 1 },
      ],
    };
    for (const status of ['ok', 'error']) {
      const raw = derivationWith({
        status,
        errorReason: status === 'ok' ? null : 'Teilantwort.',
        groups: [{ ...derivationJson.groups[0], sourceItemIndexes: [0, 2, 1] }],
      });
      expect(parseReceiptTransferDerivationResponse(raw, huge)).toMatchObject({
        ok: false,
        error: { code: 'ARITHMETIC_OVERFLOW' },
      });
    }
    const raw = derivationWith({
      groups: [{ ...derivationJson.groups[0], sourceItemIndexes: [0, 1, 2] }],
    });
    expect(parseReceiptTransferDerivationResponse(raw, huge)).toMatchObject({
      ok: true,
      value: { transfers: [{ amountCents: 1 }] },
    });
  });

  it('rejects redundant wire metadata, too many categories, and unknown keys', () => {
    expect(
      parseReceiptTransferDerivationResponse(
        derivationWith({ receiptTotalCents: 701 }),
        validExtraction,
      ),
    ).toMatchObject({ ok: false, error: { code: 'UNKNOWN_KEY' } });

    for (const changed of [
      { ...derivationJson.groups[0], buyplace: 'Anderer Markt' },
      { ...derivationJson.groups[0], receiptDate: '2024-02-30' },
      { ...derivationJson.groups[0], categoryNames: ['A', 'B', 'C', 'D'] },
      { ...derivationJson.groups[0], ignored: true },
    ]) {
      const transfers = [changed, derivationJson.groups[1]];
      expect(
        parseReceiptTransferDerivationResponse(
          derivationWith({ groups: transfers }),
          validExtraction,
        ),
      ).toMatchObject({ ok: false });
    }
  });

  it('requires bounded nonempty error reasons even when partial transfers are returned', () => {
    const error = {
      status: 'error',
      errorReason: 'Eine Position kann nicht sicher zugeordnet werden.',

      buyplace: null,
      groups: [],
    };
    expect(
      parseReceiptTransferDerivationResponse(JSON.stringify(error), validExtraction),
    ).toMatchObject({
      ok: true,
      value: { status: 'error', errorReason: error.errorReason },
    });
    expect(
      parseReceiptTransferDerivationResponse(
        JSON.stringify({ ...error, errorReason: '', groups: derivationJson.groups }),
        validExtraction,
      ),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_ERROR_REASON' } });
  });
});
