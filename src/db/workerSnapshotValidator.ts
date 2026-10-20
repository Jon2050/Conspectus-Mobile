import { withRequestDeadline } from '@shared';
import { DbRuntimeError } from './dbRuntimeErrors';
import {
  createSqliteSnapshotValidator,
  type CachedDatabaseSnapshotValidator,
} from './snapshotValidation';

// Local measurements: ~7 MiB takes >50 ms to validate. Keep sub-MiB imports inexpensive;
// route larger integrity/FK scans away from the UI thread. No database work moves into UI code.
const WORKER_THRESHOLD_BYTES = 1024 * 1024;

export const createWorkerSnapshotValidator = (): CachedDatabaseSnapshotValidator => ({
  async validate(bytes, signal): Promise<void> {
    signal?.throwIfAborted();
    if (bytes.length < WORKER_THRESHOLD_BYTES || typeof Worker === 'undefined') {
      await createSqliteSnapshotValidator().validate(bytes);
      signal?.throwIfAborted();
      return;
    }
    const worker = new Worker(new URL('./snapshotValidationWorker.ts', import.meta.url), {
      type: 'module',
    });
    try {
      await withRequestDeadline(
        async () =>
          new Promise<void>((resolve, reject) => {
            worker.onmessage = (event: MessageEvent<{ valid: boolean }>) => {
              if (event.data.valid === true) resolve();
              else
                reject(
                  new DbRuntimeError(
                    'db_open_failed',
                    'The snapshot failed compatibility validation.',
                  ),
                );
            };
            worker.onerror = () =>
              reject(
                new DbRuntimeError('db_open_failed', 'The snapshot validation worker failed.'),
              );
            // Structured clone copies once; the live session still needs the original bytes.
            worker.postMessage(bytes);
          }),
        60_000,
        signal,
      );
    } finally {
      worker.terminate();
    }
  },
});
