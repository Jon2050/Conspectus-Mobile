// Verifies the Add Transfer amount input formatting and cent parsing rules.
import { describe, expect, it } from 'vitest';

import {
  appendAmountInputDigit,
  formatAmountInputDigits,
  formatAmountInputValue,
  parseAmountInputCents,
  removeLastAmountInputDigit,
} from './addTransferAmountInput';

describe('addTransferAmountInput', () => {
  it('formats entered digits as euro cents', () => {
    expect(formatAmountInputDigits('1')).toBe('0,01€');
    expect(formatAmountInputDigits('12')).toBe('0,12€');
    expect(formatAmountInputDigits('123')).toBe('1,23€');
    expect(formatAmountInputDigits('1234')).toBe('12,34€');
  });

  it('formats pasted decimal-like values by using their digits as cents', () => {
    expect(formatAmountInputValue('12,34')).toBe('12,34€');
    expect(formatAmountInputValue('12.34')).toBe('12,34€');
    expect(formatAmountInputValue('abc')).toBe('');
  });

  it('appends and removes significant entered digits', () => {
    let value = '';
    value = appendAmountInputDigit(value, '1');
    expect(value).toBe('0,01€');

    value = appendAmountInputDigit(value, '2');
    expect(value).toBe('0,12€');

    value = removeLastAmountInputDigit(value);
    expect(value).toBe('0,01€');

    value = removeLastAmountInputDigit(value);
    expect(value).toBe('');
  });

  it('parses formatted amount values into integer cents', () => {
    expect(parseAmountInputCents('12,34€')).toBe(1234);
    expect(parseAmountInputCents('12.34')).toBe(1234);
    expect(parseAmountInputCents('0,00€')).toBe(0);
    expect(parseAmountInputCents('')).toBeNull();
    expect(parseAmountInputCents('-0,10€')).toBeNull();
  });
});
