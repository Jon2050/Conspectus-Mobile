// Declares the Lighthouse CI runner seams used by TypeScript-based script tests.
export interface LighthouseBudgetDefinition {
  label: string;
  minimumScore: number;
}

export interface LighthouseBudgetConfig {
  numberOfRuns: number;
  categories: Record<string, LighthouseBudgetDefinition>;
  audits: Record<string, LighthouseBudgetDefinition>;
}

export interface LighthouseReport {
  categories: Record<string, { score?: number | null }>;
  audits: Record<string, { score?: number | null }>;
}

export interface PwaContractResult {
  passed: boolean;
  checks: string[];
}

export interface ServiceWorkerRegistrationSnapshot {
  scope: string;
  scriptUrl: string;
}

export type ServiceWorkerVerifier = (baseUrl: URL) => Promise<void>;

export interface LighthouseCheckResult {
  id: string;
  label: string;
  aggregation: string;
  minimumScore: number;
  observedScore: number;
  passed: boolean;
}

export interface LighthouseEvaluation {
  checks: LighthouseCheckResult[];
  passed: boolean;
  pwaChecks: string[];
}

export function parseArgs(argv: string[]): {
  budgetConfig: string;
  outputDir: string;
  url: URL;
};

export function readBudgetConfig(configPath: string): LighthouseBudgetConfig;

export function evaluateReports(
  reports: LighthouseReport[],
  budgetConfig: LighthouseBudgetConfig,
  pwaContract: PwaContractResult,
): LighthouseEvaluation;

export function renderSummary(options: {
  targetUrl: string;
  reportCount: number;
  evaluation: LighthouseEvaluation | null;
  errorMessage?: string;
}): string;

export function verifyPwaContract(
  baseUrl: URL,
  fetchImpl?: typeof fetch,
  serviceWorkerVerifier?: ServiceWorkerVerifier,
): Promise<PwaContractResult>;

export function validateServiceWorkerRegistration(
  registration: ServiceWorkerRegistrationSnapshot,
  baseUrl: URL,
): void;

export function verifyServiceWorkerRegistration(baseUrl: URL): Promise<void>;

export function main(argv?: string[]): Promise<void>;
