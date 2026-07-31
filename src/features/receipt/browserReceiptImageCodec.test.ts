// Verifies browser receipt decoding, orientation hints, fallback URL cleanup, and canvas release.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserReceiptImageCodec } from './browserReceiptImageCodec';
import { createReceiptImageNormalizer } from './receiptImageNormalization';

const createFile = (): File => ({ size: 128, type: 'image/heic' }) as File;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser receipt image codec', () => {
  it('requests browser-applied source orientation and closes the decoded bitmap', async () => {
    const close = vi.fn();
    const bitmap = { width: 3024, height: 4032, close } as unknown as ImageBitmap;
    const createBitmap = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal('createImageBitmap', createBitmap);

    const decoded = await browserReceiptImageCodec.decode(
      createFile(),
      new AbortController().signal,
    );

    expect(createBitmap).toHaveBeenCalledWith(createFile(), {
      imageOrientation: 'from-image',
    });
    expect(decoded).toMatchObject({ width: 3024, height: 4032, source: bitmap });
    decoded.dispose();
    expect(close).toHaveBeenCalledOnce();
  });

  it('falls back to an image element and revokes its temporary object URL', async () => {
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported')));
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:receipt-photo'),
      revokeObjectURL: revokeObjectUrl,
    });

    class MockImage {
      naturalWidth = 1200;
      naturalHeight = 1600;
      decoding = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private value = '';

      set src(nextValue: string) {
        this.value = nextValue;
        if (nextValue) {
          queueMicrotask(() => this.onload?.());
        }
      }

      get src(): string {
        return this.value;
      }
    }
    vi.stubGlobal('Image', MockImage);

    const decoded = await browserReceiptImageCodec.decode(
      createFile(),
      new AbortController().signal,
    );
    expect(decoded).toMatchObject({ width: 1200, height: 1600 });
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    decoded.dispose();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:receipt-photo');
  });

  it('revokes the fallback object URL when image loading cannot start', async () => {
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported')));
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:receipt-photo'),
      revokeObjectURL: revokeObjectUrl,
    });

    class ThrowingImage {
      naturalWidth = 0;
      naturalHeight = 0;
      decoding = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_nextValue: string) {
        throw new Error('image loading failed');
      }
    }
    vi.stubGlobal('Image', ThrowingImage);

    await expect(
      browserReceiptImageCodec.decode(createFile(), new AbortController().signal),
    ).rejects.toThrow('image loading failed');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:receipt-photo');
  });

  it('draws only oriented pixels into an opaque JPEG canvas and releases the canvas', async () => {
    const fillRect = vi.fn();
    const drawImage = vi.fn();
    const context = { fillStyle: '', fillRect, drawImage };
    const encoded = new Blob(['encoded-pixels-only'], { type: 'image/jpeg' });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(context),
      toBlob: vi.fn((callback: BlobCallback, type: string, quality: number) => {
        expect(type).toBe('image/jpeg');
        expect(quality).toBe(0.85);
        callback(encoded);
      }),
    };
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue(canvas),
    });
    const source = {} as CanvasImageSource;

    await expect(
      browserReceiptImageCodec.encodeJpeg(
        { source, width: 1600, height: 1200, dispose: vi.fn() },
        1600,
        1200,
        0.85,
        new AbortController().signal,
      ),
    ).resolves.toBe(encoded);

    expect(canvas.getContext).toHaveBeenCalledWith('2d', { alpha: false });
    expect(fillRect).toHaveBeenCalledWith(0, 0, 1600, 1200);
    expect(drawImage).toHaveBeenCalledWith(source, 0, 0, 1600, 1200);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it('releases canvas and decoded resources immediately when pending encoding is cancelled', async () => {
    let finishEncoding: BlobCallback = () => {};
    const context = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(context),
      toBlob: vi.fn((callback: BlobCallback) => {
        finishEncoding = callback;
      }),
    };
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue(canvas),
    });
    const dispose = vi.fn();
    const normalizer = createReceiptImageNormalizer({
      decode: vi.fn().mockResolvedValue({
        source: {} as CanvasImageSource,
        width: 1600,
        height: 1200,
        dispose,
      }),
      encodeJpeg: browserReceiptImageCodec.encodeJpeg,
    });
    const abortController = new AbortController();
    const normalization = normalizer.normalize(createFile(), abortController.signal);
    await vi.waitFor(() => expect(canvas.toBlob).toHaveBeenCalledOnce());

    abortController.abort();

    await expect(normalization).rejects.toMatchObject({ name: 'AbortError' });
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(dispose).toHaveBeenCalledOnce();

    finishEncoding(new Blob(['late-result'], { type: 'image/jpeg' }));
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('releases the canvas when drawing fails before encoding', async () => {
    const context = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(() => {
        throw new Error('draw failed');
      }),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(context),
      toBlob: vi.fn(),
    };
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue(canvas),
    });

    await expect(
      browserReceiptImageCodec.encodeJpeg(
        { source: {} as CanvasImageSource, width: 10, height: 10, dispose: vi.fn() },
        10,
        10,
        0.85,
        new AbortController().signal,
      ),
    ).rejects.toThrow('draw failed');
    expect(canvas.toBlob).not.toHaveBeenCalled();
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
});
