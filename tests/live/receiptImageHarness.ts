import { browserReceiptImageCodec } from '../../src/features/receipt/browserReceiptImageCodec';
import { createReceiptImageNormalizer } from '../../src/features/receipt/receiptImageNormalization';

// Bundled in memory for Chromium; uses exactly the app's image implementation.
export const normalizeReceipt = async (
  base64: string,
  mimeType: string,
  maxLongEdgePx?: number,
) => {
  const source = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  const image = await createReceiptImageNormalizer(
    browserReceiptImageCodec,
    maxLongEdgePx,
  ).normalize(new File([source], 'receipt', { type: mimeType }), new AbortController().signal);
  return { ...image, bytes: Array.from(image.bytes) };
};
