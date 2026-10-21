import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalReceiptGroups,
  readReceiptReasoningSnapshot,
  writeReceiptReasoningSnapshot,
  readReceiptCases,
  redactReceiptText,
  requireReceiptSetting,
} from '../tests/live/receiptSupport';

describe('receipt live test support', () => {
  it('uses only a prior key/model-bound snapshot without any live metadata fetch', () => {
    const directory = mkdtempSync(join(tmpdir(), 'receipt-reasoning-'));
    const path = join(directory, 'reasoning.json');
    try {
      expect(readReceiptReasoningSnapshot('secret', 'vision', 'text', path).configuration).toEqual(
        {},
      );
      writeReceiptReasoningSnapshot(
        'secret',
        {
          visionModels: [
            {
              id: 'vision',
              name: 'Vision',
              label: 'Vision',
              reasoning: { mandatory: false, supportedEfforts: ['none', 'high', 'low'] },
            },
          ],
          transferModels: [
            { id: 'text', name: 'Text', label: 'Text', reasoning: { mandatory: true } },
          ],
        },
        123,
        path,
      );
      expect(readReceiptReasoningSnapshot('secret', 'vision', 'text', path)).toMatchObject({
        configuration: {
          visionReasoning: { enabled: true, effort: 'low' },
          transferReasoning: { enabled: true },
        },
        priorMetadataLatencyMs: 123,
      });
      expect(readReceiptReasoningSnapshot('new-key', 'vision', 'text', path).configuration).toEqual(
        {},
      );
      expect(
        readReceiptReasoningSnapshot('secret', 'new-model', 'text', path).configuration,
      ).toEqual({ transferReasoning: { enabled: true } });
      const saved = JSON.parse(readFileSync(path, 'utf8'));
      expect(readFileSync(path, 'utf8')).not.toContain('secret');
      saved.models.vision = { enabled: false, effort: 'none' };
      writeFileSync(path, JSON.stringify(saved));
      expect(readReceiptReasoningSnapshot('secret', 'vision', 'text', path).configuration).toEqual({
        transferReasoning: { enabled: true },
      });
      writeFileSync(path, '{invalid');
      expect(readReceiptReasoningSnapshot('secret', 'vision', 'text', path).configuration).toEqual(
        {},
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

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
