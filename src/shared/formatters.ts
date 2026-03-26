const WHOLE_DOLLAR_FORMATTER = new Intl.NumberFormat('en-US');
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

export type AmountSemantic = 'positive' | 'negative' | 'neutral';

export const formatAmountDisplay = (amountCents: number, semantic: AmountSemantic): string => {
  const absoluteAmountCents = Math.abs(amountCents);
  const wholeDollars = Math.trunc(absoluteAmountCents / 100);
  const remainingCents = absoluteAmountCents % 100;
  const currencyValue = `$${WHOLE_DOLLAR_FORMATTER.format(wholeDollars)}.${remainingCents
    .toString()
    .padStart(2, '0')}`;

  if (semantic === 'positive') return `+${currencyValue}`;
  if (semantic === 'negative') return `-${currencyValue}`;
  return currencyValue;
};

export const formatEpochDayToDate = (epochDay: number): string => {
  const date = new Date(epochDay * MILLIS_PER_DAY);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
};
