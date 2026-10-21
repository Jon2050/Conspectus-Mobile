import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

export const readReceiptEnvironment = () => {
  let local: Record<string, string | undefined> = {};
  try {
    local = parseEnv(readFileSync('.env.receipt.local', 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return { ...local, ...process.env };
};

export const requireReceiptSetting = (
  environment: Record<string, string | undefined>,
  name: string,
): string => {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Set ${name} in .env.receipt.local before running this command.`);
  return value;
};

export interface ReceiptLiveCase {
  id: string;
  image: string;
  // Full synthetic gold uses the existing extraction/derivation format.
  extraction?: Record<string, unknown>;
  derivation?: Record<string, unknown> | null;
  // Photographs can start with independently transcribed, partial expectations.
  expectedExtraction?: Record<string, unknown>;
  expectedLineTotalsCents?: number[];
  // Independent visual transcription; typography may vary, quantities must remain exact.
  expectedItems?: { name: string; quantityValue: number | null }[];
  // Recorded extraction for isolated text benchmarks; never treated as independent OCR gold.
  benchmarkExtraction?: Record<string, unknown>;
  note?: string;
}

export const readReceiptCases = (manifestPath: string): ReceiptLiveCase[] => {
  const manifest = resolve(manifestPath);
  const value: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
  if (!Array.isArray(value) || value.length === 0)
    throw new Error('Receipt manifest must be nonempty.');
  const ids = new Set<string>();
  return value.map((entry: ReceiptLiveCase) => {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim() || ids.has(entry.id))
      throw new Error('Receipt case IDs must be nonempty and unique.');
    if (typeof entry.image !== 'string' || !entry.image.trim())
      throw new Error(`Missing receipt image for ${entry.id}.`);
    ids.add(entry.id);
    return { ...entry, image: resolve(manifest, '..', entry.image) };
  });
};

// Provider content is deliberately retained only in ignored local reports. Never retain headers,
// request bodies (which contain image data), keys, or arbitrary exception objects.
export const redactReceiptText = (text: string, apiKey: string): string =>
  (apiKey ? text.replaceAll(apiKey, '[REDACTED]') : text).replace(
    /sk-or-v1-[a-zA-Z0-9_-]+/gu,
    '[REDACTED]',
  );

export const canonicalReceiptGroups = (value: Record<string, unknown>) =>
  (value.transfers as Record<string, unknown>[])
    .map(({ amountCents, categoryNames, buyplace, receiptDate, sourceItemIndexes }) => ({
      amountCents,
      categoryNames,
      buyplace,
      receiptDate,
      sourceItemIndexes: [...(sourceItemIndexes as number[])].sort((a, b) => a - b),
    }))
    .sort((a, b) => (a.sourceItemIndexes[0] ?? 0) - (b.sourceItemIndexes[0] ?? 0));
