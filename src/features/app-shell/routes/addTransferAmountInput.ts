// Normalizes the Add Transfer amount field as a digit-driven euro-cent input.
const NON_DIGIT_PATTERN = /\D/g;

const extractDigits = (value: string): string => value.replace(NON_DIGIT_PATTERN, '');

const trimLeadingZeros = (digits: string): string => digits.replace(/^0+(?=\d)/, '');

const toDisplayDigits = (digits: string): string => {
  const normalizedDigits = trimLeadingZeros(digits);
  return normalizedDigits.length === 0 ? '0' : normalizedDigits;
};

export const formatAmountInputDigits = (digits: string): string => {
  if (digits.length === 0) {
    return '';
  }

  const paddedDigits = toDisplayDigits(digits).padStart(3, '0');
  const euros = paddedDigits.slice(0, -2);
  const cents = paddedDigits.slice(-2);

  return `${euros},${cents}€`;
};

export const formatAmountInputValue = (value: string): string =>
  formatAmountInputDigits(extractDigits(value));

export const appendAmountInputDigit = (value: string, digit: string): string =>
  formatAmountInputDigits(`${trimLeadingZeros(extractDigits(value))}${digit}`);

export const removeLastAmountInputDigit = (value: string): string =>
  formatAmountInputDigits(trimLeadingZeros(extractDigits(value)).slice(0, -1));

export const parseAmountInputCents = (value: string): number | null => {
  if (value.includes('-')) {
    return null;
  }

  const digits = extractDigits(value);
  if (digits.length === 0) {
    return null;
  }

  const amountCents = Number(toDisplayDigits(digits));
  return Number.isSafeInteger(amountCents) ? amountCents : null;
};
