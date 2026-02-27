import { describe, expect, it } from 'vitest';
import { RuntimeEnvError, loadRuntimeEnv } from './runtimeEnv';

describe('loadRuntimeEnv', () => {
  it('throws a clear error when required variables are missing', () => {
    expect(() => loadRuntimeEnv({})).toThrowError(RuntimeEnvError);
    expect(() => loadRuntimeEnv({})).toThrowError(
      'Missing required environment variable(s): VITE_AZURE_CLIENT_ID.',
    );
  });

  it('treats blank required variables as missing', () => {
    expect(() =>
      loadRuntimeEnv({
        VITE_AZURE_CLIENT_ID: '   ',
      }),
    ).toThrowError(RuntimeEnvError);
  });

  it('returns normalized values when configuration is valid', () => {
    expect(
      loadRuntimeEnv({
        VITE_AZURE_CLIENT_ID: ' client-id ',
        VITE_DEPLOY_BASE_PATH: ' /conspectus/webapp/ ',
        VITE_DEPLOY_PUBLIC_URL: ' https://jon2050.de/conspectus/webapp/ ',
      }),
    ).toEqual({
      VITE_AZURE_CLIENT_ID: 'client-id',
      VITE_DEPLOY_BASE_PATH: '/conspectus/webapp/',
      VITE_DEPLOY_PUBLIC_URL: 'https://jon2050.de/conspectus/webapp/',
    });
  });
});
