// Sums integer cent values while failing before JavaScript number precision can drift.
const assertSafeCentInteger = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Expected ${label} to be a safe integer cent value.`);
  }
};

export const sumCents = (amounts: readonly number[]): number =>
  amounts.reduce((total, amount) => {
    assertSafeCentInteger(amount, 'amount');

    const nextTotal = total + amount;
    assertSafeCentInteger(nextTotal, 'sum');

    return nextTotal;
  }, 0);
