// Declares the Markdown formatter used by the production monitor incident workflow.
import type { MonitorResult } from './run-post-deploy-monitor.mjs';

export function formatMonitorAlert(
  result: MonitorResult,
  kind: 'failure' | 'recovery',
  repository: string,
): string;
export function main(argv?: string[]): void;
