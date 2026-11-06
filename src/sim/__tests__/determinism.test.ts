import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../config';
import { runSimulation, step } from '../engine';
import {
  cloneState,
  createInitialState,
  deserializeRun,
  deserializeState,
  policySet,
  serializeRun,
  serializeState,
} from '../state';
import { last } from './helpers';

const POLICIES = policySet({ safetyTesting: 0.6, liability: 0.5, humanReview: 0.5, retrainingFund: 0.4 });

describe('determinism and save/restore', () => {
  it('same seed + same policies → identical history', async () => {
    const a = await runSimulation({ seed: 7, policies: POLICIES });
    const b = await runSimulation({ seed: 7, policies: POLICIES });
    expect(serializeRun(DEFAULT_CONFIG, a)).toEqual(serializeRun(DEFAULT_CONFIG, b));
  });

  it('different seeds diverge', async () => {
    const a = last(await runSimulation({ seed: 1, policies: POLICIES }));
    const b = last(await runSimulation({ seed: 2, policies: POLICIES }));
    expect(serializeState(a)).not.toEqual(serializeState(b));
  });

  it('save at turn 10 → load → continue matches an uninterrupted run', async () => {
    const full = await runSimulation({ seed: 11, policies: POLICIES });
    const firstHalf = await runSimulation({ seed: 11, policies: POLICIES, turns: 10 });
    const restored = deserializeState(serializeState(last(firstHalf)));
    const secondHalf = await runSimulation({ initialState: restored, policies: POLICIES, turns: 10 });
    expect(serializeState(last(secondHalf))).toEqual(serializeState(last(full)));
  });

  it('step never mutates its input state', async () => {
    const s0 = createInitialState(DEFAULT_CONFIG, 3);
    const before = serializeState(s0);
    await step(s0, { policies: POLICIES });
    expect(serializeState(s0)).toEqual(before);
  });

  it('branching: rewind to turn 5 and take a different path', async () => {
    const history = await runSimulation({ seed: 5, policies: POLICIES });
    const branchPoint = cloneState(history[5]);
    const branch = await runSimulation({
      initialState: branchPoint,
      policies: policySet({ automationTax: 0.8 }),
      turns: 3,
    });
    expect(branch[0].turn).toBe(5);
    expect(last(branch).turn).toBe(8);
    // Original history is untouched by the branch.
    expect(history[8].policies.automationTax.strength).toBe(0);
    expect(serializeState(history[5])).toEqual(serializeState(branchPoint));
  });

  it('a full run round-trips through a save file', async () => {
    const history = await runSimulation({ seed: 9, policies: POLICIES, turns: 4 });
    const save = deserializeRun(serializeRun(DEFAULT_CONFIG, history));
    expect(save.history).toHaveLength(5);
    expect(save.history).toEqual(history);
    expect(save.config).toEqual(DEFAULT_CONFIG);
  });

  it('rejects malformed saves', () => {
    expect(() => deserializeState('{"version":1}')).toThrow(/Invalid WorldState/);
    expect(() => deserializeState(JSON.stringify({ ...createInitialState(DEFAULT_CONFIG), version: 99 }))).toThrow(/version/);
  });
});
