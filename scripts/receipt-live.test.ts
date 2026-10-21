import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalReceiptGroups,
  readReceiptCases,
  redactReceiptText,
  requireReceiptSetting,
} from '../tests/live/receiptSupport';

describe('receipt live test support', () => {
  it('loads images relative to their manifest and rejects duplicate case IDs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'receipt-manifest-'));
    const manifest = join(directory, 'cases.json');
    try {
      writeFileSync(manifest, JSON.stringify([{ id: 'photo', image: 'receipt.jpg' }]));
      expect(readReceiptCases(manifest)[0]?.image).toBe(join(directory, 'receipt.jpg'));
      writeFileSync(
        manifest,
        JSON.stringify([
          { id: 'photo', image: 'a' },
          { id: 'photo', image: 'b' },
        ]),
      );
      expect(() => readReceiptCases(manifest)).toThrow('unique');
      writeFileSync(manifest, '[]');
      expect(() => readReceiptCases(manifest)).toThrow('nonempty');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('fails explicitly on missing settings without printing credential values', () => {
    expect(() => requireReceiptSetting({ OPENROUTER_API_KEY: ' ' }, 'OPENROUTER_API_KEY')).toThrow(
      'Set OPENROUTER_API_KEY in .env.receipt.local',
    );
    expect(requireReceiptSetting({ MODEL: ' model-id ' }, 'MODEL')).toBe('model-id');
  });

  it('redacts exact keys and key-shaped strings even inside provider output', () => {
    expect(
      redactReceiptText('custom-secret custom-secret sk-or-v1-another_key', 'custom-secret'),
    ).toBe('[REDACTED] [REDACTED] [REDACTED]');
  });

  it('ignores summary wording and group order but preserves categories and item membership', () => {
    const group = {
      name: 'Original title',
      amountCents: 100,
      categoryNames: ['Einkauf', 'Lebensmittel'],
      buyplace: 'Shop',
      receiptDate: '2026-10-19',
      sourceItemIndexes: [2, 0],
    };
    expect(canonicalReceiptGroups({ transfers: [group] })).toEqual(
      canonicalReceiptGroups({
        transfers: [{ ...group, name: 'Other title', sourceItemIndexes: [0, 2] }],
      }),
    );
    expect(canonicalReceiptGroups({ transfers: [group] })).not.toEqual(
      canonicalReceiptGroups({ transfers: [{ ...group, categoryNames: ['Süßigkeiten'] }] }),
    );
  });
});
