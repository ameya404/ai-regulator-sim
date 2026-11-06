import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, makeConfig } from '../config';
import type { ActorDecider, DeciderMap } from '../decider';
import { policyChangeCost, runSimulation, step } from '../engine';
import { createInitialState, emptyPolicySet, policySet, totalJobs } from '../state';
import { POLICY_IDS, SECTORS, type WorldState } from '../types';
import { last } from './helpers';

const idle: ActorDecider = { name: 'idle', decide: () => [] };
const allIdle = (): DeciderMap => ({ bigLab: idle, startup: idle, employer: idle, labor: idle, public: idle });

const SCENARIOS = {
  none: emptyPolicySet(),
  strictSafety: policySet({ safetyTesting: 1 }),
  laborHeavy: policySet({ automationTax: 0.8, retrainingFund: 1, humanReview: 0.7 }),
  everything: policySet(Object.fromEntries(POLICY_IDS.map((p) => [p, { strength: 1, smallCompanyExemption: true }]))),
};

function checkInvariants(s: WorldState) {
  const w = s.world;
  const shares = w.marketShare.bigLab + w.marketShare.startup + w.marketShare.other;
  expect(shares).toBeCloseTo(1, 9);
  for (const v of Object.values(w.marketShare)) expect(v).toBeGreaterThanOrEqual(0);
  expect(w.publicTrust).toBeGreaterThanOrEqual(0);
  expect(w.publicTrust).toBeLessThanOrEqual(1);
  expect(w.politicalCapital).toBeGreaterThanOrEqual(0);
  expect(w.politicalCapital).toBeLessThanOrEqual(DEFAULT_CONFIG.politicalCapital.max);
  expect(w.displacedWorkers).toBeGreaterThanOrEqual(-1e-9);
  for (const sec of SECTORS) {
    expect(w.jobs[sec]).toBeGreaterThanOrEqual(0);
    expect(w.wages[sec]).toBeGreaterThan(0);
  }
  for (const p of POLICY_IDS) {
    expect(w.lobbyErosion[p]).toBeGreaterThanOrEqual(0);
    expect(w.lobbyErosion[p]).toBeLessThanOrEqual(DEFAULT_CONFIG.loopholes.lobby.maxErosion);
  }
  // No NaN / Infinity anywhere in the saved state.
  JSON.stringify(s, (_k, v) => {
    if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    return v;
  });
  if (s.actors.startup.status !== 'active') expect(w.marketShare.startup).toBe(0);
}

describe('engine invariants', () => {
  it.each(Object.entries(SCENARIOS))('%s: 20 turns stay in bounds', async (_name, policies) => {
    for (const seed of [1, 2, 3]) {
      const history = await runSimulation({ seed, policies });
      expect(history).toHaveLength(21);
      history.forEach(checkInvariants);
      // Labor force is conserved: employed + displaced is constant.
      const lf = (s: WorldState) => totalJobs(s) + s.world.displacedWorkers;
      expect(lf(last(history))).toBeCloseTo(lf(history[0]), 6);
    }
  });

  it('every move in the log carries a reason', async () => {
    const final = last(await runSimulation({ seed: 4, policies: SCENARIOS.laborHeavy }));
    const moves = final.log.filter((e) => e.kind === 'move');
    expect(moves.length).toBeGreaterThan(50);
    for (const m of moves) {
      expect(m.reason && m.reason.length).toBeTruthy();
      expect(m.actor).toBeTruthy();
      expect(m.move).toBeTruthy();
    }
  });
});

describe('political capital', () => {
  it('rejects a policy change the regulator cannot afford, and logs it', async () => {
    const s0 = createInitialState(DEFAULT_CONFIG);
    s0.world.politicalCapital = 5;
    const s1 = await step(s0, { policies: policySet({ safetyTesting: 1 }), deciders: allIdle() });
    expect(s1.policies.safetyTesting.strength).toBe(0);
    const rejected = s1.log.filter((e) => e.kind === 'policyRejected' && e.turn === 1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].target).toBe('safetyTesting');
    expect(rejected[0].data?.cost).toBe(DEFAULT_CONFIG.politicalCapital.changeCost.safetyTesting);
  });

  it('enacts affordable changes in order and charges capital', async () => {
    const s0 = createInitialState(DEFAULT_CONFIG);
    s0.world.politicalCapital = 30;
    const req = policySet({ safetyTesting: 1, liability: 1 }); // 22 + 18 > 30
    const s1 = await step(s0, { policies: req, deciders: allIdle() });
    expect(s1.policies.safetyTesting.strength).toBe(1);
    expect(s1.policies.liability.strength).toBe(0);
    expect(s1.log.some((e) => e.kind === 'policyChange' && e.target === 'safetyTesting')).toBe(true);
    expect(s1.log.some((e) => e.kind === 'policyRejected' && e.target === 'liability')).toBe(true);
  });

  it('weakening a policy is cheaper than strengthening it', async () => {
    const s0 = createInitialState(DEFAULT_CONFIG);
    s0.policies.automationTax.strength = 1;
    s0.world.politicalCapital = 12; // < 25 to raise, > 10 to lower
    const s1 = await step(s0, { policies: emptyPolicySet(), deciders: allIdle() });
    expect(s1.policies.automationTax.strength).toBe(0);
    const raise = policyChangeCost(emptyPolicySet(), policySet({ automationTax: 1 }), DEFAULT_CONFIG).automationTax;
    const lower = policyChangeCost(policySet({ automationTax: 1 }), emptyPolicySet(), DEFAULT_CONFIG).automationTax;
    expect(lower).toBeLessThan(raise);
    expect(raise).toBeGreaterThan(12);
  });
});

describe('loopholes', () => {
  const lobbyist: ActorDecider = {
    name: 'test',
    decide: () => [{ type: 'lobby', target: 'safetyTesting', reason: 'test' }],
  };

  it('undetected lobbying erodes a policy\'s effective strength', async () => {
    const config = makeConfig({ loopholes: { lobby: { detectionChance: 0 } } });
    const s0 = createInitialState(config);
    const s1 = await step(s0, { config, policies: policySet({ safetyTesting: 1 }), deciders: { ...allIdle(), bigLab: lobbyist } });
    expect(s1.world.lobbyErosion.safetyTesting).toBeCloseTo(config.loopholes.lobby.erosionPerMove);
    expect(s1.log.some((e) => e.kind === 'loopholeUndetected' && e.move === 'lobby')).toBe(true);
  });

  it('caught lobbying costs money and trust, and undoes erosion', async () => {
    const caught = makeConfig({ loopholes: { lobby: { detectionChance: 1 } } });
    const clean = makeConfig({ loopholes: { lobby: { detectionChance: 0, cost: 0.3 } } });
    const s0 = createInitialState(caught);
    s0.world.lobbyErosion.safetyTesting = 0.3;
    const policies = policySet({ safetyTesting: 1 });
    const sCaught = await step(s0, { config: caught, policies, deciders: { ...allIdle(), bigLab: lobbyist } });
    const sClean = await step(s0, { config: clean, policies, deciders: { ...allIdle(), bigLab: lobbyist } });
    expect(sCaught.world.lobbyErosion.safetyTesting).toBe(0);
    expect(sCaught.actors.bigLab.money).toBeLessThan(sClean.actors.bigLab.money - caught.loopholes.lobby.fine * 0.9);
    expect(sCaught.world.publicTrust).toBeLessThan(sClean.world.publicTrust);
    expect(sCaught.log.some((e) => e.kind === 'loopholeCaught' && e.actor === 'bigLab')).toBe(true);
  });

  it('compliance theater avoids human-review cost when undetected, and is fined when caught', async () => {
    const theater: ActorDecider = { name: 'test', decide: () => [{ type: 'complianceTheater', reason: 'test' }] };
    const honest: ActorDecider = { name: 'test', decide: () => [] };
    const mk = (p: number) => makeConfig({ loopholes: { complianceTheater: { detectionChance: p } } });
    const s0 = createInitialState(DEFAULT_CONFIG);
    s0.world.automatedJobs = 5;
    s0.policies.humanReview.strength = 1;
    const run = (config: ReturnType<typeof mk>, d: ActorDecider) => step(s0, { config, deciders: { ...allIdle(), employer: d } });
    const [h, undetected, caught] = await Promise.all([run(mk(0), honest), run(mk(0), theater), run(mk(1), theater)]);
    expect(undetected.actors.employer.money).toBeGreaterThan(h.actors.employer.money);
    expect(caught.actors.employer.money).toBeLessThan(h.actors.employer.money);
    expect(caught.world.publicTrust).toBeLessThan(h.world.publicTrust);
  });
});

describe('startup failure', () => {
  async function failStartup(config = DEFAULT_CONFIG) {
    const s0 = createInitialState(config);
    s0.actors.startup.money = -5; // stays negative after one quarter
    return step(s0, { config, deciders: allIdle() });
  }

  it('acquisition moves all of the startup\'s share to the big lab', async () => {
    const config = makeConfig({ startupFailure: { acquisitionProbability: 1 } });
    const s0Lab = createInitialState(config).world.marketShare.bigLab;
    const s1 = await failStartup(config);
    expect(s1.actors.startup.status).toBe('acquired');
    expect(s1.world.marketShare.startup).toBe(0);
    expect(s1.world.marketShare.bigLab).toBeGreaterThan(s0Lab + 0.05);
    expect(s1.log.some((e) => e.kind === 'startupFailure' && e.data?.outcome === 'acquired')).toBe(true);
  });

  it('antitrust blocks acquisition → shutdown, share split between big lab and others', async () => {
    const config = makeConfig({ startupFailure: { acquisitionProbability: 1, antitrustShareCap: 0.1 } });
    const s1 = await failStartup(config);
    expect(s1.actors.startup.status).toBe('shutDown');
    expect(s1.world.marketShare.startup).toBe(0);
    const entry = s1.log.find((e) => e.kind === 'startupFailure')!;
    expect(entry.data?.outcome).toBe('shutDown');
    expect(entry.message).toMatch(/antitrust/);
  });

  it('a failed startup no longer gets to move', async () => {
    const config = makeConfig({ startupFailure: { acquisitionProbability: 0 } });
    const s1 = await failStartup(config);
    let called = 0;
    const spy: ActorDecider = { name: 'spy', decide: () => (called++, []) };
    await step(s1, { config, deciders: { ...allIdle(), startup: spy } });
    expect(called).toBe(0);
  });
});

describe('pluggable deciders', () => {
  it('accepts an async decider (e.g. an LLM) and records its moves and memory', async () => {
    const asyncDecider: ActorDecider = {
      name: 'fake-llm',
      decide: async (view) => {
        await new Promise((r) => setTimeout(r, 1));
        return {
          moves: [{ type: 'investSafety', reason: 'An AI decided this.' }],
          memory: { note: `seen turn ${view.turn}` },
        };
      },
    };
    const s1 = await step(createInitialState(DEFAULT_CONFIG), { deciders: { bigLab: asyncDecider } });
    const entry = s1.log.find((e) => e.kind === 'move' && e.actor === 'bigLab');
    expect(entry?.move).toBe('investSafety');
    expect(entry?.reason).toBe('An AI decided this.');
    expect(s1.actors.bigLab.memory.note).toBe('seen turn 1');
    expect(s1.world.safetyStock.bigLab).toBeGreaterThan(0);
  });

  it('drops and logs illegal, duplicate, untargeted and excess moves', async () => {
    const bad: ActorDecider = {
      name: 'bad',
      decide: () =>
        [
          { type: 'strike', reason: 'not my move' }, // labor's move
          { type: 'lobby', reason: 'no target' },
          { type: 'scaleCompute', reason: 'ok' },
          { type: 'scaleCompute', reason: 'dup' },
          { type: 'cutPrices', reason: 'ok' },
          { type: 'investSafety', reason: 'over limit' },
        ] as never,
    };
    const s1 = await step(createInitialState(DEFAULT_CONFIG), { deciders: { ...allIdle(), bigLab: bad } });
    expect(s1.actors.bigLab.lastMoves).toEqual(['scaleCompute', 'cutPrices']);
    expect(s1.log.filter((e) => e.kind === 'invalidMove' && e.actor === 'bigLab')).toHaveLength(4);
  });

  it('deciders cannot mutate the real state through their view', async () => {
    const vandal: ActorDecider = {
      name: 'vandal',
      decide: (view) => {
        (view.world as { publicTrust: number }).publicTrust = 0;
        (view.self as { money: number }).money = 1e6;
        return [];
      },
    };
    const s1 = await step(createInitialState(DEFAULT_CONFIG), { deciders: { ...allIdle(), bigLab: vandal } });
    expect(s1.actors.bigLab.money).toBeLessThan(100);
    expect(s1.world.publicTrust).toBeGreaterThan(0.3);
  });
});
