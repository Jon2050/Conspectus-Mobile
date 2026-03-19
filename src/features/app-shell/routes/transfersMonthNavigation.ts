// Encapsulates month navigation state math and swipe intent detection for the Transfers route.
const MILLIS_PER_DAY = 86_400_000;
const DEFAULT_MIN_HORIZONTAL_DISTANCE_PX = 48;
const DEFAULT_HORIZONTAL_DOMINANCE_RATIO = 1.2;

export type MonthSwipeIntent = 'previous' | 'next' | null;

export interface SwipeCoordinates {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
}

export interface SwipeIntentConfig {
  readonly minHorizontalDistancePx?: number;
  readonly minHorizontalDominanceRatio?: number;
}

const toEpochDayFromUtcDate = (year: number, monthIndex: number, day: number): number =>
  Math.floor(Date.UTC(year, monthIndex, day) / MILLIS_PER_DAY);

const toSafeInteger = (value: number, fieldName: string): number => {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${fieldName} must be a safe integer.`);
  }

  return value;
};

const toFiniteNumber = (value: number): number | null => (Number.isFinite(value) ? value : null);

export const getCurrentMonthAnchorEpochDay = (now: Date = new Date()): number =>
  toEpochDayFromUtcDate(now.getFullYear(), now.getMonth(), 1);

export const shiftMonthAnchorEpochDay = (
  monthAnchorEpochDay: number,
  deltaMonths: number,
): number => {
  const safeMonthAnchorEpochDay = toSafeInteger(monthAnchorEpochDay, 'monthAnchorEpochDay');
  const safeDeltaMonths = toSafeInteger(deltaMonths, 'deltaMonths');
  const monthAnchorDate = new Date(safeMonthAnchorEpochDay * MILLIS_PER_DAY);

  return toEpochDayFromUtcDate(
    monthAnchorDate.getUTCFullYear(),
    monthAnchorDate.getUTCMonth() + safeDeltaMonths,
    1,
  );
};

export const toMonthKey = (monthAnchorEpochDay: number): string => {
  const safeMonthAnchorEpochDay = toSafeInteger(monthAnchorEpochDay, 'monthAnchorEpochDay');
  const monthAnchorDate = new Date(safeMonthAnchorEpochDay * MILLIS_PER_DAY);
  const year = monthAnchorDate.getUTCFullYear();
  const month = String(monthAnchorDate.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export const formatMonthLabel = (monthAnchorEpochDay: number, locale?: string): string => {
  const safeMonthAnchorEpochDay = toSafeInteger(monthAnchorEpochDay, 'monthAnchorEpochDay');
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return formatter.format(new Date(safeMonthAnchorEpochDay * MILLIS_PER_DAY));
};

export const resolveSwipeIntent = (
  coordinates: SwipeCoordinates,
  config: SwipeIntentConfig = {},
): MonthSwipeIntent => {
  const safeStartX = toFiniteNumber(coordinates.startX);
  const safeStartY = toFiniteNumber(coordinates.startY);
  const safeEndX = toFiniteNumber(coordinates.endX);
  const safeEndY = toFiniteNumber(coordinates.endY);
  if (safeStartX === null || safeStartY === null || safeEndX === null || safeEndY === null) {
    return null;
  }

  const minimumHorizontalDistance =
    config.minHorizontalDistancePx ?? DEFAULT_MIN_HORIZONTAL_DISTANCE_PX;
  const minimumHorizontalDominanceRatio =
    config.minHorizontalDominanceRatio ?? DEFAULT_HORIZONTAL_DOMINANCE_RATIO;
  const deltaX = safeEndX - safeStartX;
  const deltaY = safeEndY - safeStartY;
  const absoluteHorizontalDistance = Math.abs(deltaX);
  const absoluteVerticalDistance = Math.abs(deltaY);

  if (absoluteHorizontalDistance < minimumHorizontalDistance) {
    return null;
  }

  const horizontalDominanceRatio =
    absoluteVerticalDistance === 0
      ? Number.POSITIVE_INFINITY
      : absoluteHorizontalDistance / absoluteVerticalDistance;
  if (horizontalDominanceRatio < minimumHorizontalDominanceRatio) {
    return null;
  }

  if (deltaX < 0) {
    return 'next';
  }

  return 'previous';
};
