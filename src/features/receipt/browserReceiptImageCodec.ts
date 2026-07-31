// Implements orientation-aware browser decoding and metadata-free canvas JPEG re-encoding.
import type { DecodedReceiptImage, ReceiptImageCodec } from './receiptImageNormalization';

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new DOMException('Receipt image processing was cancelled.', 'AbortError');
  }
};

const decodeWithImageBitmap = async (
  file: File,
  signal: AbortSignal,
): Promise<DecodedReceiptImage> => {
  throwIfAborted(signal);
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  if (signal.aborted) {
    bitmap.close();
    throw new DOMException('Receipt image processing was cancelled.', 'AbortError');
  }

  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    dispose: () => bitmap.close(),
  };
};

const decodeWithImageElement = (file: File, signal: AbortSignal): Promise<DecodedReceiptImage> =>
  new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    let hasSettled = false;

    const cleanupListeners = (): void => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', handleAbort);
    };
    const release = (): void => {
      cleanupListeners();
      try {
        image.src = '';
      } catch {
        // The URL still has to be revoked when a browser rejects clearing a failed image source.
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    const handleAbort = (): void => {
      if (hasSettled) {
        return;
      }
      hasSettled = true;
      release();
      reject(new DOMException('Receipt image processing was cancelled.', 'AbortError'));
    };

    image.decoding = 'async';
    image.onload = () => {
      if (hasSettled) {
        return;
      }
      hasSettled = true;
      cleanupListeners();
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dispose: release,
      });
    };
    image.onerror = () => {
      if (hasSettled) {
        return;
      }
      hasSettled = true;
      release();
      reject(new Error('The browser could not decode the receipt image.'));
    };
    signal.addEventListener('abort', handleAbort, { once: true });
    try {
      image.src = objectUrl;
    } catch (error) {
      hasSettled = true;
      release();
      reject(error);
    }
  });

const decodeReceiptImage = async (
  file: File,
  signal: AbortSignal,
): Promise<DecodedReceiptImage> => {
  try {
    return await decodeWithImageBitmap(file, signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    return decodeWithImageElement(file, signal);
  }
};

const encodeReceiptImageAsJpeg = (
  image: DecodedReceiptImage,
  width: number,
  height: number,
  quality: number,
  signal: AbortSignal,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const releaseCanvas = (): void => {
      canvas.width = 0;
      canvas.height = 0;
    };
    const context = canvas.getContext('2d', { alpha: false });
    if (context === null) {
      releaseCanvas();
      reject(new Error('A browser canvas is unavailable.'));
      return;
    }

    let hasSettled = false;
    const settle = (complete: () => void): void => {
      if (hasSettled) {
        return;
      }
      hasSettled = true;
      signal.removeEventListener('abort', handleAbort);
      releaseCanvas();
      complete();
    };
    const handleAbort = (): void => {
      settle(() =>
        reject(new DOMException('Receipt image processing was cancelled.', 'AbortError')),
      );
    };
    signal.addEventListener('abort', handleAbort, { once: true });

    try {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image.source, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (signal.aborted) {
            handleAbort();
            return;
          }
          if (blob === null) {
            settle(() => reject(new Error('The browser could not encode the receipt image.')));
            return;
          }
          settle(() => resolve(blob));
        },
        'image/jpeg',
        quality,
      );
    } catch (error) {
      settle(() => reject(error));
    }
  });

export const browserReceiptImageCodec: ReceiptImageCodec = {
  decode: decodeReceiptImage,
  encodeJpeg: encodeReceiptImageAsJpeg,
};
