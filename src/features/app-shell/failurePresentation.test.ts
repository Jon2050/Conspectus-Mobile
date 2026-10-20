import { describe, expect, it } from 'vitest';
import { presentOperationFailure } from './failurePresentation';

describe('operation failure presentation', () => {
  it.each([
    ['unauthorized', 'auth', 'sign_in'],
    ['network_error', 'connection', 'retry'],
    ['cache_unavailable', 'cache', 'retry'],
    ['database_invalid', 'database', 'select_file'],
    ['permission_denied', 'permission', 'select_file'],
    ['database_changed', 'changed', 'retry'],
    ['db_query_failed', 'query', 'reload'],
  ])('maps %s to a localized class with an appropriate action', (code, key, action) => {
    expect(presentOperationFailure({ code, message: 'Private technical detail' })).toEqual({
      messageKey: `sync.failure.${key}`,
      action,
    });
  });
  it('does not expose unknown diagnostic text', () => {
    expect(presentOperationFailure(new Error('Private technical detail'))).toEqual({
      messageKey: 'sync.failure.unexpected',
      action: 'retry',
    });
  });
});
