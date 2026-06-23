/**
 * Date and time testing utilities.
 * Provides functions to generate epoch dates consistently for unit and integration tests.
 */

import { MILLIS_PER_DAY } from '../utils';

export const toEpochDay = (year: number, month: number, day: number): number =>
  Math.floor(Date.UTC(year, month - 1, day) / MILLIS_PER_DAY);
