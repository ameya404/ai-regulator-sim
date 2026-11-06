import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, createInitialState, makeConfig, policySet, runSimulation, step, type ActorDecider, type DeciderMap } from '../../sim';
import { buildNews, isHiddenEntry, quarterLabel, shortQuarter } from '../format';
import { compareOutcomes, insights, policyMarkers, previewPolicyCosts, strengthGap, toChartRows } from '../derive';

const idle: ActorDecider = { name: 'idle', decide: () => [] };
const allIdle: DeciderMap = { bigLab: idle, startup: idle, employer: idle, labor: idle, public: idle };

describe('format', () => {
  it('labels quarters from Q1 2027', () => {
    expect(quarterLabel(0)).toBe('Start');
    expect(quarterLabel(1)).toBe('Q1 2027');
    expect(quarterLabel(4)).toBe('Q4 2027');
    expect(quarterLabel(5)).toBe('Q1 2028');
    expect(quarterLabel(20)).toBe('Q4 2031');
    expect(shortQuarter(20)).toBe("Q4 '31");
  });

  it('hides loopholes, undetected events and filler moves unless revealed', async () => {
    const history = await runSimulation({ seed: 3, policies: policySet({ safetyTesting: 1, humanReview: 0.8 }), turns: 8 });
    const log = history[history.length - 1].log;
    const visible = buildNews(log, false);
    const all = buildNews(log, true);
    expect(all.length).toBeGreaterThan(visible.length);
    expect(visible.some((n) => n.hidden)).toBe(false);
    // Loophole moves exist in this run but only show when revealed.
    expect(log.some((e) => e.kind === 'move' && (e.move === 'lobby' || e.move === 'complianceTheater'))).toBe(true);
    expect(all.some((n) => n.hidden && /lobbies|rubber-stamps/.test(n.headline))).toBe(true);
    // Being caught is public.
    for (const e of log.filter((x) => x.kind === 'loopholeCaught')) expect(isHiddenEntry(e)).toBe(false);
    // Newest quarter first; reasons carried through.
    expect(visible[0].turn).toBe(8);
    expect(visible.filter((n) => n.reason).length).toBeGreaterThan(5);
  });
});

describe('derive', () => {
  it('chart rows: shares in %, jobs and wages indexed to 100 at start', async () => {
    const rows = toChartRows(await runSimulation({ seed: 1, turns: 3 }));
    expect(rows).toHaveLength(4);
    expect(rows[0].manufacturing).toBe(100);
    expect(rows[0].wage_services).toBe(100);
    expect(rows[2].bigLab + rows[2].startup + rows[2].other).toBeCloseTo(100, 6);
  });

  it('marks only quarters where enacted policy actually changed', async () => {
    const s0 = createInitialState(DEFAULT_CONFIG);
    s0.world.politicalCapital = 30;
    const s1 = await step(s0, { policies: policySet({ safetyTesting: 1 }), deciders: allIdle }); // enacted
    const s2 = await step(s1, { policies: policySet({ safetyTesting: 1 }), deciders: allIdle }); // no change
    s2.world.politicalCapital = 1;
    const s3 = await step(s2, { policies: policySet({ safetyTesting: 1, automationTax: 1 }), deciders: allIdle }); // rejected
    const markers = policyMarkers([s0, s1, s2, s3]);
    expect(markers).toEqual([{ turn: 1, changes: [{ policy: 'safetyTesting', from: 0, to: 1, exemptionChanged: false, exemption: false }] }]);
  });

  it('cost preview agrees with what the engine actually enacts', async () => {
    for (const capital of [5, 20, 30, 45, 100]) {
      const s0 = createInitialState(DEFAULT_CONFIG);
      s0.world.politicalCapital = capital;
      const want = policySet({ safetyTesting: 1, liability: 0.5, automationTax: { strength: 0.6, smallCompanyExemption: true } });
      const preview = previewPolicyCosts(s0, want, DEFAULT_CONFIG);
      const s1 = await step(s0, { policies: want, deciders: allIdle });
      for (const p of ['safetyTesting', 'liability', 'automationTax'] as const) {
        const enacted = s1.policies[p].strength === want[p].strength;
        expect(enacted, `${p} at capital ${capital}`).toBe(preview.rows[p].affordable);
      }
    }
  });

  it('strength gap reveals lobbying erosion', () => {
    const s = createInitialState(DEFAULT_CONFIG);
    s.policies.safetyTesting.strength = 1;
    s.world.lobbyErosion.safetyTesting = 0.3;
    const gap = strengthGap(s);
    expect(gap.safetyTesting.set).toBe(1);
    expect(gap.safetyTesting.effective).toBeCloseTo(0.7);
    expect(gap.liability).toEqual({ set: 0, effective: 0 });
  });

  it('end-of-game comparison and insights reflect the counterfactual', async () => {
    const config = makeConfig();
    const yours = await runSimulation({ config, seed: 2, policies: policySet({ safetyTesting: 1 }) });
    const base = await runSimulation({ config, initialState: yours[0], policies: policySet({}) });
    const final = yours[yours.length - 1];
    const rows = compareOutcomes(final, base[base.length - 1]);
    expect(rows.map((r) => r.label)).toContain('Total AI incidents');
    const notes = insights(final, base[base.length - 1]);
    // Strict safety testing entrenches the incumbent (see engine tests).
    expect(notes.some((n) => n.includes('entrenched'))).toBe(true);
  });
});
