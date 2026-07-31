// Verifies bounded receipt resizing, re-encoding, validation failures, and byte cleanup.
import { describe, expect, it, vi, type Mock } from 'vitest';

import {
  RECEIPT_IMAGE_JPEG_QUALITY,
  RECEIPT_IMAGE_MAX_OUTPUT_BYTES,
  RECEIPT_IMAGE_MAX_SOURCE_BYTES,
  ReceiptImageNormalizationError,
  calculateReceiptImageDimensions,
  createReceiptImageNormalizer,
  disposeNormalizedReceiptImage,
  type DecodedReceiptImage,
  type ReceiptImageCodec,
} from './receiptImageNormalization';

const createDecodedImage = (
  width = 4032,
  height = 3024,
): DecodedReceiptImage & { dispose: Mock<() => void> } => ({
  source: {} as CanvasImageSource,
  width,
  height,
  dispose: vi.fn<() => void>(),
});

const createFile = (size = 128): File =>
  ({ size, type: 'image/heic' }) as Pick<File, 'size' | 'type'> as File;

const deferred = () => {
  let resolve = (): void => {};
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
};

describe('receipt image normalization', () => {
  it('preserves aspect ratio, avoids upscaling, and bounds the longest edge', () => {
    expect(calculateReceiptImageDimensions(1200, 800)).toEqual({ width: 1200, height: 800 });
    expect(calculateReceiptImageDimensions(4032, 3024)).toEqual({ width: 2560, height: 1920 });
    expect(calculateReceiptImageDimensions(3024, 4032)).toEqual({ width: 1920, height: 2560 });
  });

  it.each([
    [0, 100],
    [100, 0],
    [Number.NaN, 100],
    [100, Number.POSITIVE_INFINITY],
  ])('rejects invalid decoded dimensions', (width, height) => {
    expect(() => calculateReceiptImageDimensions(width, height)).toThrow(
      new ReceiptImageNormalizationError('invalid_dimensions'),
    );
  });

  it('rejects empty and oversized sources before decoding', async () => {
    const codec: ReceiptImageCodec = {
      decode: vi.fn(),
      encodeJpeg: vi.fn(),
    };
    const normalizer = createReceiptImageNormalizer(codec);

    await expect(
      normalizer.normalize(createFile(0), new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'empty_file',
    });
    await expect(
      normalizer.normalize(
        createFile(RECEIPT_IMAGE_MAX_SOURCE_BYTES + 1),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'source_too_large' });
    expect(codec.decode).not.toHaveBeenCalled();
  });

  it('decodes orientation-aware dimensions and returns only new bounded JPEG bytes', async () => {
    const decodedImage = createDecodedImage();
    const sanitizedBytes = new TextEncoder().encode('fresh-jpeg-without-source-metadata');
    const codec: ReceiptImageCodec = {
      decode: vi.fn().mockResolvedValue(decodedImage),
      encodeJpeg: vi.fn().mockResolvedValue(new Blob([sanitizedBytes], { type: 'image/jpeg' })),
    };
    const normalizer = createReceiptImageNormalizer(codec);

    const image = await normalizer.normalize(createFile(), new AbortController().signal);

    expect(codec.encodeJpeg).toHaveBeenCalledWith(
      decodedImage,
      2560,
      1920,
      RECEIPT_IMAGE_JPEG_QUALITY,
      expect.any(AbortSignal),
    );
    expect(image).toMatchObject({ mimeType: 'image/jpeg', width: 2560, height: 1920 });
    expect(image.bytes).toEqual(sanitizedBytes);
    expect(decodedImage.dispose).toHaveBeenCalledOnce();

    disposeNormalizedReceiptImage(image);
    expect(image.bytes.every((byte) => byte === 0)).toBe(true);
  });

  it('maps decode and encode failures without leaking source details', async () => {
    const decodeFailure = new Error('sensitive-camera-file-name.heic');
    const decodeCodec: ReceiptImageCodec = {
      decode: vi.fn().mockRejectedValue(decodeFailure),
      encodeJpeg: vi.fn(),
    };
    await expect(
      createReceiptImageNormalizer(decodeCodec).normalize(
        createFile(),
        new AbortController().signal,
      ),
    ).rejects.toEqual(new ReceiptImageNormalizationError('decode_failed'));

    const decodedImage = createDecodedImage();
    const encodeCodec: ReceiptImageCodec = {
      decode: vi.fn().mockResolvedValue(decodedImage),
      encodeJpeg: vi.fn().mockRejectedValue(new Error('canvas failed')),
    };
    await expect(
      createReceiptImageNormalizer(encodeCodec).normalize(
        createFile(),
        new AbortController().signal,
      ),
    ).rejects.toEqual(new ReceiptImageNormalizationError('encode_failed'));
    expect(decodedImage.dispose).toHaveBeenCalledOnce();
  });

  it('rejects invalid and oversized encoded output and always disposes decoded resources', async () => {
    const invalidDecodedImage = createDecodedImage();
    const invalidCodec: ReceiptImageCodec = {
      decode: vi.fn().mockResolvedValue(invalidDecodedImage),
      encodeJpeg: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
    };
    await expect(
      createReceiptImageNormalizer(invalidCodec).normalize(
        createFile(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'encode_failed' });
    expect(invalidDecodedImage.dispose).toHaveBeenCalledOnce();

    const oversizedDecodedImage = createDecodedImage();
    const oversizedBlob = {
      type: 'image/jpeg',
      size: RECEIPT_IMAGE_MAX_OUTPUT_BYTES + 1,
    } as Blob;
    const oversizedCodec: ReceiptImageCodec = {
      decode: vi.fn().mockResolvedValue(oversizedDecodedImage),
      encodeJpeg: vi.fn().mockResolvedValue(oversizedBlob),
    };
    await expect(
      createReceiptImageNormalizer(oversizedCodec).normalize(
        createFile(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'output_too_large' });
    expect(oversizedDecodedImage.dispose).toHaveBeenCalledOnce();
  });

  it('zeroes encoded bytes when cancellation wins after encoding', async () => {
    const decodedImage = createDecodedImage();
    const arrayBufferGate = deferred();
    const encodedBytes = new Uint8Array([7, 8, 9]);
    const encodedBlob = {
      type: 'image/jpeg',
      size: encodedBytes.byteLength,
      arrayBuffer: async () => {
        await arrayBufferGate.promise;
        return encodedBytes.buffer;
      },
    } as Blob;
    const codec: ReceiptImageCodec = {
      decode: vi.fn().mockResolvedValue(decodedImage),
      encodeJpeg: vi.fn().mockResolvedValue(encodedBlob),
    };
    const abortController = new AbortController();
    const normalization = createReceiptImageNormalizer(codec).normalize(
      createFile(),
      abortController.signal,
    );
    await vi.waitFor(() => expect(codec.encodeJpeg).toHaveBeenCalledOnce());

    abortController.abort();
    arrayBufferGate.resolve();

    await expect(normalization).rejects.toMatchObject({ name: 'AbortError' });
    expect(encodedBytes.every((byte) => byte === 0)).toBe(true);
    expect(decodedImage.dispose).toHaveBeenCalledOnce();
  });
});
