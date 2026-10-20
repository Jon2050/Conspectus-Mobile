import { createSqliteSnapshotValidator } from './snapshotValidation';

// One request per worker. The caller always terminates it, including on context replacement.
self.onmessage = async (event: MessageEvent<Uint8Array>) => {
  try {
    await createSqliteSnapshotValidator().validate(event.data);
    self.postMessage({ valid: true });
  } catch {
    self.postMessage({ valid: false });
  }
};
