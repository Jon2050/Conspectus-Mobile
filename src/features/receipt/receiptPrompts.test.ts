// Verifies both receipt prompt defaults remain non-empty, versioned, and easy to customize.
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TRANSFER_DERIVATION_PROMPT,
  RECEIPT_EXTRACTION_SYSTEM_PROMPT,
} from './receiptPrompts';

describe('receipt prompts', () => {
  it('keeps the extraction prompt app-owned and versioned', () => {
    expect(RECEIPT_EXTRACTION_SYSTEM_PROMPT.version).toBeGreaterThan(0);
    expect(RECEIPT_EXTRACTION_SYSTEM_PROMPT.text.trim()).not.toBe('');
    expect(RECEIPT_EXTRACTION_SYSTEM_PROMPT.text).toContain('exact integer-cent amount');
  });

  it('provides an editable plain-text group and category mapping section', () => {
    expect(DEFAULT_TRANSFER_DERIVATION_PROMPT.version).toBeGreaterThan(0);
    expect(DEFAULT_TRANSFER_DERIVATION_PROMPT.text).toContain('GROUP AND CATEGORY MAPPINGS');
    expect(DEFAULT_TRANSFER_DERIVATION_PROMPT.text).toContain('categories:');
  });
});
