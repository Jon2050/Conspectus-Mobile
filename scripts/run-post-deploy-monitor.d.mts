// Declares the production monitor inputs, persisted identity, and machine-readable result contract.
import type { SmokeCheckOptions } from './verify-production-deploy-smoke.mjs';

export interface MonitorOptions {
  baseUrl: string;
  stateJson: string;
  outputJson: string;
  simulateFailure: boolean;
  requestTimeoutMs: number;
  deadlineSeconds: number;
}

export interface DeployIdentity {
  commitSha: string;
  deployRunId: string;
  qualityRunId: string;
  observedAt?: string;
}

export interface MonitorResult {
  schemaVersion: 1;
  status: 'success' | 'failure';
  checkedAt: string;
  baseUrl: string;
  simulated: boolean;
  consecutiveFailures: number;
  alertThreshold: number;
  alertRequired: boolean;
  observedIdentity: DeployIdentity | null;
  lastKnownSuccess: DeployIdentity | null;
  triageIdentity: DeployIdentity | null;
  error: string;
  monitorRunUrl: string;
}

export interface MonitorDependencies {
  fetchImpl?: typeof fetch;
  smokeImpl?: (options: SmokeCheckOptions, fetchImpl?: typeof fetch) => Promise<void>;
  now?: () => Date;
  environment?: Record<string, string | undefined>;
}

export function parseArgs(argv: string[]): MonitorOptions;
export function runPostDeployMonitor(
  options: MonitorOptions,
  dependencies?: MonitorDependencies,
): Promise<MonitorResult>;
export function main(argv?: string[]): Promise<void>;
