// Provides formatting utilities for monetary amounts and epoch-day dates.
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

export type AmountSemantic = 'positive' | 'negative' | 'neutral';

export const formatAmountDisplay = (
  amountCents: number,
  semantic: AmountSemantic,
  locale?: string | null,
): string => {
  const value = Math.abs(amountCents) / 100;
  const formatted = new Intl.NumberFormat(locale || 'de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);

  if (semantic === 'positive') return `+${formatted}`;
  if (semantic === 'negative') return `-${formatted}`;
  return formatted;
};

export const formatEpochDayToDate = (epochDay: number, locale?: string | null): string => {
  const date = new Date(epochDay * MILLIS_PER_DAY);
  return new Intl.DateTimeFormat(locale || 'de-DE', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
};
