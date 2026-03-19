// Keeps app-shell startup DB runtime application deterministic across overlapping sync operations.
import type { BrowserDbRuntime } from '@db';

import type { StartupFreshnessDecision } from './startupFreshnessService';

export type StartupDbRuntimeSyncResult = 'applied' | 'superseded';

export const syncDbRuntimeForStartupDecision = async (
  dbRuntime: Pick<BrowserDbRuntime, 'open' | 'close'>,
  decision: StartupFreshnessDecision,
  shouldApply: () => boolean,
): Promise<StartupDbRuntimeSyncResult> => {
  if (decision.kind !== 'ready') {
    if (!shouldApply()) {
      return 'superseded';
    }

    dbRuntime.close();
    return 'applied';
  }

  if (!shouldApply()) {
    return 'superseded';
  }

  await dbRuntime.open(decision.snapshot.dbBytes, {
    canApply: shouldApply,
  });

  return shouldApply() ? 'applied' : 'superseded';
};
