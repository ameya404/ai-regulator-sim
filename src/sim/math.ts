export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const clamp01 = (x: number): number => clamp(x, 0, 1);
export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
/** Round to a fixed number of decimals (used to keep saved numbers tidy in logs). */
export const round = (x: number, d = 3): number => Math.round(x * 10 ** d) / 10 ** d;
