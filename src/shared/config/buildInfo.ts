// Resolves deterministic runtime build metadata for app UI surfaces like the deployment footer.
export interface BuildInfo {
  readonly version: string;
  readonly buildTimeUtc: string;
}

export interface BuildInfoLoaderOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}

export interface BuildInfoFormatOptions {
  readonly locale?: Intl.LocalesArgument;
  readonly timeZone?: string;
}

interface DeployMetadataPayload {
  readonly buildTimeUtc?: unknown;
}

const DEPLOY_METADATA_FILE_NAME = 'deploy-metadata.json';
const ISO_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;

const normalizeBaseUrl = (baseUrl: string): string =>
  baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isValidBuildTimeUtc = (value: unknown): value is string =>
  typeof value === 'string' &&
  ISO_UTC_TIMESTAMP_PATTERN.test(value) &&
  Number.isFinite(Date.parse(value));

const resolveFallbackBuildInfo = (): BuildInfo => ({
  version: __APP_VERSION__,
  buildTimeUtc: __APP_BUILD_TIME_UTC__,
});

export const getFallbackBuildInfo = (): BuildInfo => ({
  ...resolveFallbackBuildInfo(),
});

export const resolveDeployMetadataUrl = (baseUrl = import.meta.env.BASE_URL): string =>
  new URL(DEPLOY_METADATA_FILE_NAME, `https://conspectus.local${normalizeBaseUrl(baseUrl)}`)
    .pathname;

export const loadBuildInfo = async (options: BuildInfoLoaderOptions = {}): Promise<BuildInfo> => {
  const fallbackBuildInfo = resolveFallbackBuildInfo();
  const fetchImplementation = options.fetch ?? globalThis.fetch?.bind(globalThis);

  if (!fetchImplementation) {
    return fallbackBuildInfo;
  }

  try {
    const response = await fetchImplementation(resolveDeployMetadataUrl(options.baseUrl), {
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      return fallbackBuildInfo;
    }

    const payload = (await response.json()) as DeployMetadataPayload;
    if (!isRecord(payload) || !isValidBuildTimeUtc(payload.buildTimeUtc)) {
      return fallbackBuildInfo;
    }

    return {
      version: fallbackBuildInfo.version,
      buildTimeUtc: payload.buildTimeUtc,
    };
  } catch {
    return fallbackBuildInfo;
  }
};

export const formatBuildInfoTimestamp = (
  buildTimeUtc: string,
  options: BuildInfoFormatOptions = {},
): string => {
  const buildDate = new Date(buildTimeUtc);
  const dateLabel = new Intl.DateTimeFormat(options.locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: options.timeZone,
  }).format(buildDate);
  const timeLabel = new Intl.DateTimeFormat(options.locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: options.timeZone,
  }).format(buildDate);

  return `${dateLabel} ${timeLabel}`;
};

export const formatBuildInfoLabel = (
  buildInfo: BuildInfo,
  options: BuildInfoFormatOptions = {},
): string =>
  `Ver. ${buildInfo.version} ${formatBuildInfoTimestamp(buildInfo.buildTimeUtc, options)}`;
