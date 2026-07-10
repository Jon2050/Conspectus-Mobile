// Formats stable Settings metadata without deriving timestamps from the device's current time.
export const formatSettingsTimestampUtc = (
  timestamp: string,
  locale?: Intl.LocalesArgument,
): string => {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  return `${new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
    hour12: false,
  }).format(date)} UTC`;
};
