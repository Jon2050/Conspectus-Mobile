export const sumCents = (amounts: number[]): number =>
  amounts.reduce((total, amount) => total + amount, 0);
