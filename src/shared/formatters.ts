// Provides formatting utilities for monetary amounts and epoch-day dates.
const WHOLE_EURO_FORMATTER = new Intl.NumberFormat('de-DE');
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

export type AmountSemantic = 'positive' | 'negative' | 'neutral';

export const formatAmountDisplay = (amountCents: number, semantic: AmountSemantic): string => {
  const absoluteAmountCents = Math.abs(amountCents);
  const wholeEuros = Math.trunc(absoluteAmountCents / 100);
  const remainingCents = absoluteAmountCents % 100;
  const currencyValue = `${WHOLE_EURO_FORMATTER.format(wholeEuros)},${remainingCents
    .toString()
    .padStart(2, '0')}€`;

  if (semantic === 'positive') return `+${currencyValue}`;
  if (semantic === 'negative') return `-${currencyValue}`;
  return currencyValue;
};

export const formatEpochDayToDate = (epochDay: number, locale?: string | null): string => {
  const date = new Date(epochDay * MILLIS_PER_DAY);
  const normalizedLocale = locale || 'de';
  if (normalizedLocale.startsWith('de')) {
    const day = date.getUTCDate();
    const month = new Intl.DateTimeFormat('de-DE', { month: 'long', timeZone: 'UTC' }).format(date);
    const year = date.getUTCFullYear();
    return `${day}. ${month}, ${year}`;
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
};
