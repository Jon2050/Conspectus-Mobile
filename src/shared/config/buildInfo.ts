// Identifies the running bundle without mixing in metadata from a different deployment.
export interface BuildInfo {
  readonly version: string;
  readonly buildTimeUtc: string;
}

export interface BuildInfoFormatOptions {
  readonly locale?: Intl.LocalesArgument;
  readonly timeZone?: string;
}

export const getBuildInfo = (): BuildInfo => ({
  ...__APP_BUILD_INFO__,
});

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
