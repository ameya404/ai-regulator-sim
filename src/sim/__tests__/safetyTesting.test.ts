/**
 * Claim under test: strict safety testing with no small-company exemption
 * hurts the startup more than the big lab.
 *
 * Fairness: the startup is ~25x smaller than the big lab, so we compare each
 * firm against ITSELF in a no-policy run with the same seed, using percentage
 * change — never absolute $B.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../config';
import { runSimulation } from '../engine';
import { safetyTestingCost, type LabComplianceInput } from '../policies';
import { createInitialState, emptyPolicySet, policySet } from '../state';
import { labMoney, last, pctChange } from './helpers';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const NO_POLICY = emptyPolicySet();
const STRICT = policySet({ safetyTesting: { strength: 1, smallCompanyExemption: false } });
const STRICT_EXEMPT = policySet({ safetyTesting: { strength: 1, smallCompanyExemption: true } });

async function compare(seed: number, policies = STRICT) {
  const base = last(await runSimulation({ seed, policies: NO_POLICY }));
  const strict = last(await runSimulation({ seed, policies }));
  return {
    startupMoney: pctChange(labMoney(strict, 'startup'), labMoney(base, 'startup')),
    bigLabMoney: pctChange(labMoney(strict, 'bigLab'), labMoney(base, 'bigLab')),
    startupShare: pctChange(strict.world.marketShare.startup, base.world.marketShare.startup),
    bigLabShare: pctChange(strict.world.marketShare.bigLab, base.world.marketShare.bigLab),
    strictPolicyEnacted: strict.policies.safetyTesting.strength === 1,
  };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('strict safety testing, no exemption', () => {
  it('compliance costs a larger share of revenue for the startup than for the big lab (mechanism)', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const input = (lab: 'bigLab' | 'startup'): LabComplianceInput => ({
      lab,
      revenue: state.actors[lab].revenue,
      safetyStrength: 1,
      liabilityStrength: 0,
      burdenSafety: 1,
      burdenLiability: 1,
      safetyAvoided: 0,
    });
    const startupRatio = safetyTestingCost(input('startup'), DEFAULT_CONFIG) / state.actors.startup.revenue;
    const bigLabRatio = safetyTestingCost(input('bigLab'), DEFAULT_CONFIG) / state.actors.bigLab.revenue;
    expect(startupRatio).toBeGreaterThan(bigLabRatio * 3);
  });

  it.each(SEEDS)('seed %i: startup loses a larger % of its money and market share than the big lab', async (seed) => {
    const r = await compare(seed);
    expect(r.strictPolicyEnacted).toBe(true);
    // The startup is clearly hurt in relative terms...
    expect(r.startupMoney).toBeLessThan(-0.2);
    expect(r.startupShare).toBeLessThan(-0.2);
    // ...and hurt more than the big lab, by both measures.
    expect(r.startupMoney).toBeLessThan(r.bigLabMoney);
    expect(r.startupShare).toBeLessThan(r.bigLabShare);
  });

  it('on average across seeds, the gap is large', async () => {
    const rs = await Promise.all(SEEDS.map((s) => compare(s)));
    const gapMoney = mean(rs.map((r) => r.bigLabMoney - r.startupMoney));
    const gapShare = mean(rs.map((r) => r.bigLabShare - r.startupShare));
    expect(gapMoney).toBeGreaterThan(0.3); // ≥30 percentage points
    expect(gapShare).toBeGreaterThan(0.3);
  });

  it('a small-company exemption shrinks the startup\'s relative loss', async () => {
    const strict = await Promise.all(SEEDS.map((s) => compare(s, STRICT)));
    const exempt = await Promise.all(SEEDS.map((s) => compare(s, STRICT_EXEMPT)));
    expect(mean(exempt.map((r) => r.startupShare))).toBeGreaterThan(mean(strict.map((r) => r.startupShare)));
    expect(mean(exempt.map((r) => r.startupMoney))).toBeGreaterThan(mean(strict.map((r) => r.startupMoney)));
  });
});
