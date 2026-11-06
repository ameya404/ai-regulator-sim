import type { LabId, WorldState } from '../types';

/** Percentage change of `value` relative to `baseline` (e.g. -0.25 = 25% lower). */
export function pctChange(value: number, baseline: number): number {
  if (baseline === 0) throw new Error('pctChange: baseline is zero');
  return (value - baseline) / Math.abs(baseline);
}

/** Lab money; a failed startup counts as 0 (its equity is wiped out). */
export function labMoney(s: WorldState, lab: LabId): number {
  return s.actors[lab].status === 'active' ? s.actors[lab].money : 0;
}

export const last = <T>(xs: readonly T[]): T => xs[xs.length - 1];
