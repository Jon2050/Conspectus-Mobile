/** Local performance entries contain phase names and durations only; nothing is transmitted. */
export const measurePhase = async <T>(phase: string, operation: () => Promise<T>): Promise<T> => {
  const start = performance.now();
  try {
    return await operation();
  } finally {
    performance.clearMeasures(`conspectus:${phase}`);
    performance.measure(`conspectus:${phase}`, { start, end: performance.now() });
  }
};
