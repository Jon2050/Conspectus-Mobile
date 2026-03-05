export interface SmokeCheckOptions {
  baseUrl: string;
  commitSha: string;
  deployRunId: string;
  maxAttempts: number;
  retryDelaySeconds: number;
  requestTimeoutMs: number;
  skipSecurityHeaderChecks: boolean;
}

export type SleepFunction = (milliseconds: number) => Promise<void>;

export function parseArgs(argv: string[]): SmokeCheckOptions;

export function runSmokeChecks(
  options: SmokeCheckOptions,
  fetchImpl?: typeof fetch,
  sleepImpl?: SleepFunction,
): Promise<void>;

export function main(argv?: string[]): Promise<void>;
