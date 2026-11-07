import { describe, expect, it } from 'vitest';
import { createInitialState, emptyPolicySet, policySet, runSimulation, step, type PolicySet, type WorldState } from '../../sim';
import { compareOutcomes, hiddenReveal, insights, policyMarkers, toQuarterRows, toYearRows } from '../derive';
import { buildNews, isHiddenDuringGame, people, quarterLabel } from '../format';
import { simpleGameConfig, yearIncidents, yearSlices } from '../game';
import { summarizeYear } from '../summary';

const config = simpleGameConfig();
const play = (policies: PolicySet | ((turn: number) => PolicySet), seed = 1) => runSimulation({ config, seed, policies });
const STRICT_SAFETY = policySet({ safetyTesting: 1 });

/** Words that would leak hidden mechanics (cheating, lobbying, political capital) into the game. */
const LEAK = /lobb|cheat|caught|gam(ed|es|ing) (its|the)|rubber|capital|fine[ds]?\b|loophole|investigat/i;

describe('format', () => {
  it('labels quarters and people in plain words', () => {
    expect(quarterLabel(0)).toBe('Start of 2027');
    expect(quarterLabel(5)).toBe('Q1 2028');
    expect(people(0.823)).toBe('820,000');
    expect(people(1.24)).toBe('1.2 million');
  });

  it('news shown during the game never includes cheating, lobbying or capital', async () => {
    const history = await play(STRICT_SAFETY, 3);
    const log = history[history.length - 1].log;
    // The run does contain hidden activity...
    expect(log.some((e) => e.kind === 'move' && e.move === 'lobby')).toBe(true);
    // ...but none of it reaches the player.
    const news = buildNews(log);
    expect(news.length).toBeGreaterThan(20);
    for (const n of news) expect(n.headline + (n.reason ?? '')).not.toMatch(LEAK);
    expect(log.filter((e) => e.kind === 'loopholeCaught').every(isHiddenDuringGame)).toBe(true);
  });
});

describe('simple game', () => {
  it('rule changes are never rejected, even with no political capital', async () => {
    const s0 = createInitialState(config);
    s0.world.politicalCapital = 0;
    const s1 = await step(s0, { config, policies: policySet({ safetyTesting: 1, automationTax: 1, retrainingFund: 1 }) });
    expect(s1.policies.safetyTesting.strength).toBe(1);
    expect(s1.policies.automationTax.strength).toBe(1);
    expect(s1.log.some((e) => e.kind === 'policyRejected')).toBe(false);
  });

  it('groups quarters into 5 years', async () => {
    const history = await play(emptyPolicySet());
    const years = yearSlices(history);
    expect(years.map((y) => y.calendarYear)).toEqual([2027, 2028, 2029, 2030, 2031]);
    expect(years[0].quarters.map((s) => s.turn)).toEqual([1, 2, 3, 4]);
    expect(toYearRows(history).map((r) => r.incidents)).toEqual(years.map(yearIncidents));
    expect(toQuarterRows(history)).toHaveLength(21);
  });

  it('marks the start of each year where a visible rule changed', async () => {
    const schedule = (turn: number) => (turn <= 4 ? STRICT_SAFETY : turn <= 8 ? STRICT_SAFETY : policySet({ safetyTesting: 1, automationTax: 0.5 }));
    const markers = policyMarkers(await play(schedule));
    expect(markers.map((m) => [m.x, m.calendarYear])).toEqual([
      [0, 2027],
      [8, 2029],
    ]);
    expect(markers[1].changes).toEqual([{ rule: 'automationTax', from: 'off', to: 'light', skipChanged: false, skip: false }]);
  });
});

describe('what happened this year', () => {
  const scenarios: [string, PolicySet][] = [
    ['nothing', emptyPolicySet()],
    ['strict safety', STRICT_SAFETY],
    ['safety + skip', policySet({ safetyTesting: { strength: 1, smallCompanyExemption: true } })],
    ['tax + retraining', policySet({ automationTax: 1, retrainingFund: 1 })],
    ['everything', policySet({ safetyTesting: 0.5, automationTax: 0.5, retrainingFund: 0.5 })],
  ];

  it.each(scenarios)('%s: 2–3 plain sentences every year, nothing hidden leaks', async (_name, policies) => {
    for (const seed of [1, 2, 3]) {
      const years = yearSlices(await play(policies, seed));
      years.forEach((y, i) => {
        const sentences = summarizeYear(y, years[i - 1], config);
        expect(sentences.length).toBeGreaterThanOrEqual(2);
        expect(sentences.length).toBeLessThanOrEqual(3);
        for (const s of sentences) {
          expect(s).toMatch(/[.!]$/);
          expect(s).not.toMatch(LEAK);
        }
      });
    }
  });

  it('never credits MegaCorp with more job losses than happened in total', async () => {
    const years = yearSlices(await play(emptyPolicySet(), 2));
    for (const y of years) {
      const text = summarizeYear(y, undefined, config).join(' ');
      const m = text.match(/AI replaced about ([\d.,]+)( million)? workers this year, about ([\d.,]+)( million)? of them at MegaCorp/);
      if (!m) continue;
      const toNum = (n: string, mil?: string) => Number(n.replace(/,/g, '')) * (mil ? 1_000_000 : 1);
      expect(toNum(m[3], m[4])).toBeLessThanOrEqual(toNum(m[1], m[2]));
    }
  });

  it('explains why strict safety testing helps the big AI company', async () => {
    const years = yearSlices(await play(STRICT_SAFETY, 1));
    const all = years.flatMap((y, i) => summarizeYear(y, years[i - 1], config)).join(' ');
    expect(all).toMatch(/Safety testing cost the small startup much more than the big AI company/);
  });
});

describe('end screen', () => {
  it('compares against doing nothing and reveals hidden lobbying', async () => {
    const yours = await play(STRICT_SAFETY, 2);
    const base = await runSimulation({ config, initialState: yours[0], policies: emptyPolicySet() });
    expect(compareOutcomes(yours, base).map((r) => r.label)).toContain('AI safety incidents');
    expect(insights(yours, base).join(' ')).toMatch(/more powerful/);
    const reveal = hiddenReveal(yours).join(' ');
    expect(reveal).toMatch(/secretly lobbied against your rules \d+ times?/);
    expect(reveal).toMatch(/worked at only about \d+% of the strength you chose/);
  });

  it('says so when nobody cheated', async () => {
    const history: WorldState[] = await play(emptyPolicySet());
    expect(hiddenReveal(history)).toEqual(['Nothing. Every company played by your rules this time.']);
  });
});
