import type { SimConfig } from './config';
import { marketRevenue } from './policies';
import { seedToState } from './rng';
import {
  ACTOR_IDS,
  POLICY_IDS,
  SECTORS,
  type ActorId,
  type ActorState,
  type PolicyId,
  type PolicySet,
  type Sector,
  type WorldState,
} from './types';

export const STATE_VERSION = 1;

export function emptyPolicySet(): PolicySet {
  return Object.fromEntries(
    POLICY_IDS.map((id) => [id, { strength: 0, smallCompanyExemption: false }]),
  ) as PolicySet;
}

/** Convenience: build a full PolicySet from a partial description. */
export function policySet(
  partial: Partial<Record<PolicyId, number | { strength: number; smallCompanyExemption?: boolean }>>,
): PolicySet {
  const out = emptyPolicySet();
  for (const id of POLICY_IDS) {
    const v = partial[id];
    if (v === undefined) continue;
    out[id] =
      typeof v === 'number'
        ? { strength: v, smallCompanyExemption: false }
        : { strength: v.strength, smallCompanyExemption: v.smallCompanyExemption ?? false };
  }
  return out;
}

export function createInitialState(config: SimConfig, seed: number = config.seed): WorldState {
  const init = config.initial;
  const actors = Object.fromEntries(
    ACTOR_IDS.map((id): [ActorId, ActorState] => [
      id,
      { id, money: init.money[id], status: 'active', revenue: 0, profit: 0, lastMoves: [], memory: {} },
    ]),
  ) as Record<ActorId, ActorState>;

  // Seed last-quarter revenue so size-based exemptions are correct on turn 1.
  const market = marketRevenue(config, init.aiCapability, init.publicTrust);
  actors.bigLab.revenue = market * init.marketShare.bigLab;
  actors.startup.revenue = market * init.marketShare.startup;
  actors.employer.revenue = config.employer.baseProfit;

  return {
    version: STATE_VERSION,
    turn: 0,
    rngState: seedToState(seed),
    world: {
      aiCapability: init.aiCapability,
      marketShare: { ...init.marketShare },
      jobs: { ...init.jobs },
      wages: { ...init.wages },
      displacedWorkers: 0,
      newlyDisplaced: 0,
      automatedJobs: 0,
      safetyIncidents: 0,
      cumulativeIncidents: 0,
      publicTrust: init.publicTrust,
      politicalCapital: init.politicalCapital,
      lobbyErosion: Object.fromEntries(POLICY_IDS.map((p) => [p, 0])) as Record<PolicyId, number>,
      safetyStock: { bigLab: 0, startup: 0 },
      investigationLevel: 0,
    },
    actors,
    policies: emptyPolicySet(),
    log: [],
  };
}

/** Deep copy. States are plain JSON so structuredClone is exact. */
export function cloneState(state: WorldState): WorldState {
  return structuredClone(state);
}

export function serializeState(state: WorldState): string {
  return JSON.stringify(state);
}

export function deserializeState(json: string): WorldState {
  const parsed = JSON.parse(json) as WorldState;
  validateState(parsed);
  return parsed;
}

/** A full save: config + every turn's state. Enough for rewind and branching. */
export interface SaveFile {
  version: number;
  config: SimConfig;
  history: WorldState[];
}

export function serializeRun(config: SimConfig, history: readonly WorldState[]): string {
  const save: SaveFile = { version: STATE_VERSION, config, history: [...history] };
  return JSON.stringify(save);
}

export function deserializeRun(json: string): SaveFile {
  const save = JSON.parse(json) as SaveFile;
  if (save.version !== STATE_VERSION) throw new Error(`Unsupported save version ${save.version}`);
  save.history.forEach(validateState);
  return save;
}

/** Light structural validation so a corrupted save fails loudly instead of silently. */
export function validateState(s: WorldState): void {
  const fail = (msg: string): never => {
    throw new Error(`Invalid WorldState: ${msg}`);
  };
  if (s === null || typeof s !== 'object') fail('not an object');
  if (s.version !== STATE_VERSION) fail(`version ${s.version} != ${STATE_VERSION}`);
  if (!Number.isInteger(s.turn) || s.turn < 0) fail('bad turn');
  if (typeof s.rngState !== 'number') fail('bad rngState');
  for (const id of ACTOR_IDS) if (!s.actors?.[id]) fail(`missing actor ${id}`);
  for (const p of POLICY_IDS) if (!s.policies?.[p]) fail(`missing policy ${p}`);
  for (const sec of SECTORS as readonly Sector[]) {
    if (typeof s.world?.jobs?.[sec] !== 'number') fail(`missing jobs.${sec}`);
  }
  if (!Array.isArray(s.log)) fail('log not an array');
}

// ---------------------------------------------------------------------------
// Derived values (selectors) — computed, never stored, so they can't go stale
// ---------------------------------------------------------------------------

export function totalJobs(state: WorldState): number {
  return SECTORS.reduce((a, s) => a + state.world.jobs[s], 0);
}

/** Employment-weighted average wage across sectors ($K/yr). */
export function averageWage(state: WorldState): number {
  const total = totalJobs(state);
  if (total <= 0) return 0;
  return SECTORS.reduce((a, s) => a + state.world.jobs[s] * state.world.wages[s], 0) / total;
}
