// Defines the testable receipt-image normalization contract and its bounded output format.

export const RECEIPT_IMAGE_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const RECEIPT_IMAGE_MAX_LONG_EDGE_PX = 2560;
export const RECEIPT_IMAGE_JPEG_QUALITY = 0.85;
export const RECEIPT_IMAGE_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
export const RECEIPT_IMAGE_OUTPUT_MIME_TYPE = 'image/jpeg' as const;

export type ReceiptImageNormalizationErrorCode =
  | 'empty_file'
  | 'source_too_large'
  | 'decode_failed'
  | 'invalid_dimensions'
  | 'encode_failed'
  | 'output_too_large';

export class ReceiptImageNormalizationError extends Error {
  constructor(readonly code: ReceiptImageNormalizationErrorCode) {
    super(`Receipt image normalization failed: ${code}.`);
    this.name = 'ReceiptImageNormalizationError';
  }
}

export interface NormalizedReceiptImage {
  readonly mimeType: typeof RECEIPT_IMAGE_OUTPUT_MIME_TYPE;
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface DecodedReceiptImage {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  dispose(): void;
}

export interface ReceiptImageCodec {
  decode(file: File, signal: AbortSignal): Promise<DecodedReceiptImage>;
  encodeJpeg(
    image: DecodedReceiptImage,
    width: number,
    height: number,
    quality: number,
    signal: AbortSignal,
  ): Promise<Blob>;
}

export interface ReceiptImageNormalizer {
  normalize(file: File, signal: AbortSignal): Promise<NormalizedReceiptImage>;
}

export interface ReceiptImageDimensions {
  readonly width: number;
  readonly height: number;
}

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new DOMException('Receipt image normalization was cancelled.', 'AbortError');
  }
};

export const calculateReceiptImageDimensions = (
  width: number,
  height: number,
  maxLongEdgePx: number = RECEIPT_IMAGE_MAX_LONG_EDGE_PX,
): ReceiptImageDimensions => {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(maxLongEdgePx) ||
    maxLongEdgePx <= 0
  ) {
    throw new ReceiptImageNormalizationError('invalid_dimensions');
  }

  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdgePx) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  const scale = maxLongEdgePx / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

export const disposeNormalizedReceiptImage = (image: NormalizedReceiptImage | null): void => {
  image?.bytes.fill(0);
};

const toNormalizationError = (
  error: unknown,
  fallbackCode: ReceiptImageNormalizationErrorCode,
): ReceiptImageNormalizationError | unknown =>
  error instanceof ReceiptImageNormalizationError
    ? error
    : error instanceof DOMException && error.name === 'AbortError'
      ? error
      : new ReceiptImageNormalizationError(fallbackCode);

export const createReceiptImageNormalizer = (codec: ReceiptImageCodec): ReceiptImageNormalizer => ({
  async normalize(file, signal): Promise<NormalizedReceiptImage> {
    throwIfAborted(signal);
    if (file.size === 0) {
      throw new ReceiptImageNormalizationError('empty_file');
    }
    if (file.size > RECEIPT_IMAGE_MAX_SOURCE_BYTES) {
      throw new ReceiptImageNormalizationError('source_too_large');
    }

    let decodedImage: DecodedReceiptImage;
    try {
      decodedImage = await codec.decode(file, signal);
    } catch (error) {
      throw toNormalizationError(error, 'decode_failed');
    }

    try {
      throwIfAborted(signal);
      const dimensions = calculateReceiptImageDimensions(decodedImage.width, decodedImage.height);

      let encodedImage: Blob;
      try {
        encodedImage = await codec.encodeJpeg(
          decodedImage,
          dimensions.width,
          dimensions.height,
          RECEIPT_IMAGE_JPEG_QUALITY,
          signal,
        );
      } catch (error) {
        throw toNormalizationError(error, 'encode_failed');
      }

      throwIfAborted(signal);
      if (encodedImage.type !== RECEIPT_IMAGE_OUTPUT_MIME_TYPE || encodedImage.size === 0) {
        throw new ReceiptImageNormalizationError('encode_failed');
      }
      if (encodedImage.size > RECEIPT_IMAGE_MAX_OUTPUT_BYTES) {
        throw new ReceiptImageNormalizationError('output_too_large');
      }

      const bytes = new Uint8Array(await encodedImage.arrayBuffer());
      try {
        throwIfAborted(signal);
        return {
          mimeType: RECEIPT_IMAGE_OUTPUT_MIME_TYPE,
          bytes,
          width: dimensions.width,
          height: dimensions.height,
        };
      } catch (error) {
        bytes.fill(0);
        throw error;
      }
    } finally {
      decodedImage.dispose();
    }
  },
});
