import { describe, expect, it } from 'vitest';
import { emptyPolicySet, policySet, type PolicySet } from '../../sim';
import { changePhrase, compareTable, pathLabel, SIGNIFICANT, verdict } from '../compare';
import { playGame, simpleGameConfig } from '../game';
import { decodeGame, encodeGame, startPathB, type Game } from '../useSimulation';

const config = simpleGameConfig();
const LEAK = /lobb|cheat|caught|loophole|capital|fine[ds]?\b|investigat/i;

async function finished(seed: number, policies: PolicySet | ((t: number) => PolicySet)): Promise<Game> {
  return { seed, config, history: await playGame(config, seed, policies) };
}

describe('Path B replays the same world', () => {
  it('starts from an identical state with Path A’s first-year rules', async () => {
    const a = await finished(4, policySet({ safetyTesting: 1, retrainingFund: 0.5 }));
    const { game: b, rules } = startPathB(a);
    expect(b.seed).toBe(a.seed);
    expect(b.history).toHaveLength(1);
    expect(b.history[0]).toEqual(a.history[0]);
    expect(b.history[0]).not.toBe(a.history[0]); // a copy, not shared
    expect(rules).toEqual(a.history[1].policies);
    expect(b.pathA?.history).toBe(a.history);
  });

  it('same rules + aligned luck → the exact same five years', async () => {
    const rules = policySet({ safetyTesting: 1 });
    const a = await playGame(config, 9, rules);
    const b = await playGame(config, 9, rules, a[0]);
    expect(b).toEqual(a);
  });

  it('a comparison save file round-trips both paths', async () => {
    const a = await finished(5, policySet({ safetyTesting: 1 }));
    const { game } = startPathB(a);
    const b: Game = { ...game, history: await playGame(config, 5, policySet({ safetyTesting: { strength: 1, smallCompanyExemption: true } }), game.history[0]) };
    const back = decodeGame(encodeGame(b));
    expect(back.history).toEqual(b.history);
    expect(back.pathA?.history).toEqual(a.history);
    expect(back.pathA?.seed).toBe(5);
  });
});

describe('path labels', () => {
  it('describes rules in plain words', async () => {
    expect(pathLabel((await finished(1, emptyPolicySet())).history)).toBe('No rules');
    expect(pathLabel((await finished(1, policySet({ safetyTesting: 1 }))).history)).toBe('Safety strict');
    expect(pathLabel((await finished(1, policySet({ safetyTesting: { strength: 1, smallCompanyExemption: true } }))).history)).toBe(
      'Safety strict, small companies skip',
    );
    const later = (t: number) => (t > 8 ? policySet({ safetyTesting: 1, automationTax: 0.5 }) : policySet({ safetyTesting: 1 }));
    expect(pathLabel((await finished(1, later)).history)).toBe('Safety strict · Automation tax light from 2029');
  });
});

describe('verdict', () => {
  const pairs: [PolicySet, PolicySet][] = [
    [policySet({ safetyTesting: 1 }), policySet({ safetyTesting: { strength: 1, smallCompanyExemption: true } })],
    [emptyPolicySet(), policySet({ safetyTesting: 1 })],
    [emptyPolicySet(), policySet({ automationTax: 1 })],
    [emptyPolicySet(), policySet({ retrainingFund: 1 })],
    [policySet({ automationTax: 0.5 }), policySet({ automationTax: 1 })],
    [policySet({ retrainingFund: 1 }), emptyPolicySet()],
    [emptyPolicySet(), policySet({ safetyTesting: 0.5, automationTax: 0.5, retrainingFund: 0.5 })],
  ];

  it.each(pairs.map((p, i) => [i, p] as const))('pair %i: always exactly two clean sentences', async (_i, [pa, pb]) => {
    for (const seed of [1, 2, 3]) {
      const a = await playGame(config, seed, pa);
      const b = await playGame(config, seed, pb, a[0]);
      const v = verdict(a, b);
      expect(v).toHaveLength(2);
      for (const s of v) {
        expect(s).toMatch(/^[A-Z].*[.]$/);
        expect(s.split(/\. /)).toHaveLength(1); // one sentence each
        expect(s).not.toMatch(LEAK);
      }
    }
  });

  it('names the change in plain words', async () => {
    const a = await playGame(config, 1, policySet({ safetyTesting: 1 }));
    const b = await playGame(config, 1, policySet({ safetyTesting: { strength: 1, smallCompanyExemption: true } }), a[0]);
    expect(changePhrase(a, b)).toBe('Letting small companies skip safety testing');
    const c = await playGame(config, 1, policySet({ safetyTesting: 1, automationTax: 1 }), a[0]);
    expect(changePhrase(a, c)).toBe('Adding a strict automation tax');
    expect(changePhrase(c, a)).toBe('Dropping the automation tax');
  });

  it('same rules → says so', async () => {
    const a = await playGame(config, 2, policySet({ safetyTesting: 1 }));
    expect(verdict(a, a)[0]).toBe('Both paths used the same rules, so they turned out the same.');
  });

  it('table marks agree with the significance thresholds the verdict uses', async () => {
    for (const seed of [1, 2, 3]) {
      const a = await playGame(config, seed, emptyPolicySet());
      const b = await playGame(config, seed, policySet({ automationTax: 1 }), a[0]);
      const [jobs, incidents] = compareTable(a, b);
      const dj = Math.abs(parseFloat(jobs.b) - parseFloat(jobs.a));
      const di = Math.abs(Number(incidents.b) - Number(incidents.a));
      if (jobs.verdict !== 0) expect(dj).toBeGreaterThanOrEqual(SIGNIFICANT.jobs - 0.1); // values shown rounded to 0.1
      if (incidents.verdict !== 0) expect(di).toBeGreaterThanOrEqual(SIGNIFICANT.incidents);
      else expect(di).toBeLessThan(SIGNIFICANT.incidents);
    }
  });
});
