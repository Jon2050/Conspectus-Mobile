// Verifies single-flight receipt capture, typed handoff, cancellation, and ephemeral cleanup.
import { describe, expect, it, vi } from 'vitest';

import type { ReadyOpenRouterReceiptConfiguration } from './openRouterReceiptConfiguration';
import {
  createReceiptCaptureController,
  type ReceiptCaptureState,
  type ReceiptStageOneStarter,
} from './receiptCaptureController';
import {
  ReceiptImageNormalizationError,
  type NormalizedReceiptImage,
  type ReceiptImageNormalizer,
} from './receiptImageNormalization';
import { RECEIPT_EXTRACTION_SYSTEM_PROMPT } from './receiptPrompts';

const CONFIGURATION: ReadyOpenRouterReceiptConfiguration = {
  apiKey: 'secret-key',
  visionModelId: 'vision-model',
  transferModelId: 'transfer-model',
  extractionPrompt: RECEIPT_EXTRACTION_SYSTEM_PROMPT,
  transferPrompt: 'Transfer prompt',
};

const createFile = (): File => ({ size: 12, type: 'image/jpeg' }) as File;

const createImage = (): NormalizedReceiptImage => ({
  mimeType: 'image/jpeg',
  bytes: new Uint8Array([1, 2, 3, 4]),
  width: 1200,
  height: 1600,
});

const deferred = () => {
  let resolve = (): void => {};
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
};

describe('receipt capture controller', () => {
  it('normalizes once, hands only the normalized image to stage one, and clears bytes afterward', async () => {
    const image = createImage();
    const normalizer: ReceiptImageNormalizer = { normalize: vi.fn().mockResolvedValue(image) };
    const stageOneStarter: ReceiptStageOneStarter = { start: vi.fn().mockResolvedValue(undefined) };
    const controller = createReceiptCaptureController({
      normalizer,
      resolveConfiguration: () => CONFIGURATION,
      stageOneStarter,
    });
    const states: ReceiptCaptureState[] = [];
    controller.subscribe((state) => states.push(state));

    await expect(controller.capture(createFile())).resolves.toBe(true);

    expect(normalizer.normalize).toHaveBeenCalledOnce();
    expect(stageOneStarter.start).toHaveBeenCalledOnce();
    expect(stageOneStarter.start).toHaveBeenCalledWith(
      { image, configuration: CONFIGURATION },
      expect.any(AbortSignal),
    );
    expect(states.map((state) => state.phase)).toEqual([
      'idle',
      'normalizing',
      'handed_off',
      'idle',
    ]);
    expect(image.bytes.every((byte) => byte === 0)).toBe(true);
  });

  it('does not normalize or hand off cancellation without a file or missing configuration', async () => {
    const normalizer: ReceiptImageNormalizer = { normalize: vi.fn() };
    const stageOneStarter: ReceiptStageOneStarter = { start: vi.fn() };
    const controller = createReceiptCaptureController({
      normalizer,
      resolveConfiguration: () => null,
      stageOneStarter,
    });

    await expect(controller.capture(null)).resolves.toBe(false);
    await expect(controller.capture(createFile())).resolves.toBe(false);

    expect(normalizer.normalize).not.toHaveBeenCalled();
    expect(stageOneStarter.start).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({
      phase: 'error',
      errorCode: 'configuration_unavailable',
    });
  });

  it('prevents duplicate capture and clears image memory when the run is cancelled', async () => {
    const image = createImage();
    const normalizer: ReceiptImageNormalizer = { normalize: vi.fn().mockResolvedValue(image) };
    const stage = deferred();
    const stageOneStarter: ReceiptStageOneStarter = {
      start: vi.fn().mockReturnValue(stage.promise),
      reset: vi.fn(),
    };
    const controller = createReceiptCaptureController({
      normalizer,
      resolveConfiguration: () => CONFIGURATION,
      stageOneStarter,
    });

    const firstCapture = controller.capture(createFile());
    await vi.waitFor(() => expect(controller.getState().phase).toBe('handed_off'));
    await expect(controller.capture(createFile())).resolves.toBe(false);
    controller.cancel();

    expect(normalizer.normalize).toHaveBeenCalledOnce();
    expect(stageOneStarter.start).toHaveBeenCalledOnce();
    expect(stageOneStarter.reset).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toEqual({ phase: 'idle', errorCode: null });
    expect(image.bytes.every((byte) => byte === 0)).toBe(true);

    stage.resolve();
    await expect(firstCapture).resolves.toBe(false);
  });

  it('surfaces safe normalization and stage-one failures and permits a fresh run', async () => {
    const normalizer: ReceiptImageNormalizer = {
      normalize: vi
        .fn()
        .mockRejectedValueOnce(new ReceiptImageNormalizationError('decode_failed'))
        .mockResolvedValueOnce(createImage()),
    };
    const stageOneStarter: ReceiptStageOneStarter = {
      start: vi.fn().mockRejectedValue(new Error('provider response with sensitive details')),
    };
    const controller = createReceiptCaptureController({
      normalizer,
      resolveConfiguration: () => CONFIGURATION,
      stageOneStarter,
    });

    await expect(controller.capture(createFile())).resolves.toBe(false);
    expect(controller.getState()).toEqual({ phase: 'error', errorCode: 'decode_failed' });

    await expect(controller.capture(createFile())).resolves.toBe(false);
    expect(controller.getState()).toEqual({ phase: 'error', errorCode: 'stage_one_failed' });
    expect(stageOneStarter.start).toHaveBeenCalledOnce();
  });

  it('aborts and suppresses stale normalization completion after disposal', async () => {
    const normalization = deferred();
    const image = createImage();
    const normalizer: ReceiptImageNormalizer = {
      normalize: vi.fn().mockImplementation(async () => {
        await normalization.promise;
        return image;
      }),
    };
    const stageOneStarter: ReceiptStageOneStarter = { start: vi.fn() };
    const controller = createReceiptCaptureController({
      normalizer,
      resolveConfiguration: () => CONFIGURATION,
      stageOneStarter,
    });

    const capture = controller.capture(createFile());
    controller.dispose();
    normalization.resolve();

    await expect(capture).resolves.toBe(false);
    expect(stageOneStarter.start).not.toHaveBeenCalled();
    expect(image.bytes.every((byte) => byte === 0)).toBe(true);
  });
});
