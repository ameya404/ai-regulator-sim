/**
 * The turn engine. `step` is pure from the caller's point of view: it never
 * mutates the input state and returns a brand-new state. Keep every returned
 * state in an array and you have rewind (pick an index) and branching (call
 * `step` again from an earlier index with different policies).
 *
 * Turn order:
 *   1. Clone previous state, advance turn, decay persistent effects.
 *   2. Regulator's policy changes (paid with political capital; may be rejected).
 *   3. Every active actor decides simultaneously from the same view.
 *   4. Moves are validated, logged with reasons, and applied in actor order.
 *   5. Economy updates (markets, incidents, jobs, wages, trust, capital, failure).
 */
import { ACTORS, legalMoves, moveDefinition } from './actors/definitions';
import { applyMove } from './actors/moves';
import { createScriptedDeciders } from './actors/scriptedDecider';
import { DEFAULT_CONFIG, type SimConfig } from './config';
import type { DeciderMap, ProposedMove } from './decider';
import { applyStartOfTurnDecay, updateEconomy } from './economy';
import { clamp01, round } from './math';
import { effectiveStrengths, POLICY_LABELS, qualifiesAsSmall } from './policies';
import { Rng } from './rng';
import { cloneState, createInitialState } from './state';
import { createTurnContext, type TurnContext } from './turnContext';
import { ACTOR_IDS, POLICY_IDS, type ActorId, type ActorView, type Move, type PolicySet, type WorldState } from './types';

export interface StepOptions {
  config?: SimConfig;
  /** Desired policy settings for this quarter. Omit to keep current policies. */
  policies?: PolicySet;
  /** Decision-makers per actor. Defaults to the scripted rules. */
  deciders?: Partial<DeciderMap>;
}

/** Political capital needed to move from one policy set to another. */
export function policyChangeCost(from: PolicySet, to: PolicySet, config: SimConfig) {
  const pc = config.politicalCapital;
  return Object.fromEntries(
    POLICY_IDS.map((p) => {
      const delta = clamp01(to[p].strength) - from[p].strength;
      const strengthCost = delta >= 0 ? delta * pc.changeCost[p] : -delta * pc.changeCost[p] * pc.weakenCostFactor;
      const toggle = to[p].smallCompanyExemption !== from[p].smallCompanyExemption ? pc.exemptionToggleCost : 0;
      return [p, strengthCost + toggle];
    }),
  ) as Record<(typeof POLICY_IDS)[number], number>;
}

/** Apply requested policy changes in a fixed order, rejecting any the regulator can't afford. */
function applyPolicyChanges(ctx: TurnContext, desired: PolicySet): void {
  const { draft, config } = ctx;
  const costs = policyChangeCost(draft.policies, desired, config);
  for (const p of POLICY_IDS) {
    const cur = draft.policies[p];
    const next = { strength: clamp01(desired[p].strength), smallCompanyExemption: desired[p].smallCompanyExemption };
    if (next.strength === cur.strength && next.smallCompanyExemption === cur.smallCompanyExemption) continue;
    const cost = costs[p];
    const describe = `${POLICY_LABELS[p]} ${round(cur.strength, 2)} → ${round(next.strength, 2)}${
      next.smallCompanyExemption !== cur.smallCompanyExemption
        ? next.smallCompanyExemption
          ? ' (adding small-company exemption)'
          : ' (removing small-company exemption)'
        : ''
    }`;
    if (cost > draft.world.politicalCapital + 1e-9) {
      ctx.log({
        kind: 'policyRejected',
        actor: 'regulator',
        target: p,
        message: `Rejected: ${describe}. Needs ${round(cost, 1)} political capital, only ${round(draft.world.politicalCapital, 1)} available.`,
        data: { cost: round(cost), available: round(draft.world.politicalCapital) },
      });
      continue;
    }
    draft.world.politicalCapital -= cost;
    draft.policies[p] = next;
    ctx.log({
      kind: 'policyChange',
      actor: 'regulator',
      target: p,
      message: `Enacted: ${describe} (cost ${round(cost, 1)} capital).`,
      data: { cost: round(cost), strength: next.strength, exemption: next.smallCompanyExemption },
    });
  }
}

/** Build the read-only view an actor decides from. A deep copy, so deciders can't mutate state. */
export function buildActorView(state: WorldState, actor: ActorId, config: SimConfig, sinceTurn: number): ActorView {
  const copy = cloneState(state);
  return {
    turn: copy.turn,
    self: copy.actors[actor],
    world: copy.world,
    actors: copy.actors,
    policies: copy.policies,
    effectiveStrength: effectiveStrengths(copy.world, copy.policies),
    qualifiesAsSmall: qualifiesAsSmall(copy, actor, config),
    recentEvents: copy.log.filter((e) => e.turn >= sinceTurn),
  };
}

/** Validate proposed moves: legal for this actor, targets present, no duplicates, within the per-turn limit. */
function validateMoves(ctx: TurnContext, actor: ActorId, proposed: unknown): Move[] {
  const accepted: Move[] = [];
  const invalid = (message: string, p?: Partial<ProposedMove>) =>
    ctx.log({ kind: 'invalidMove', actor, move: p?.type, reason: p?.reason, message });

  if (!Array.isArray(proposed)) {
    invalid('Decider returned a non-array; no moves this quarter.');
    return accepted;
  }
  const legal = legalMoves(actor);
  for (const raw of proposed as Partial<ProposedMove>[]) {
    if (!raw || typeof raw.type !== 'string' || !(legal as readonly string[]).includes(raw.type)) {
      invalid(`"${String(raw?.type)}" is not a legal move for ${ACTORS[actor].name}.`, raw);
      continue;
    }
    const def = moveDefinition(actor, raw.type)!;
    if (def.requiresTarget && !(raw.target && (POLICY_IDS as readonly string[]).includes(raw.target))) {
      invalid(`${def.label} needs a valid target policy.`, raw);
      continue;
    }
    if (accepted.some((m) => m.type === raw.type)) {
      invalid(`${def.label} chosen twice; duplicate ignored.`, raw);
      continue;
    }
    if (accepted.length >= ctx.config.maxMovesPerActor) {
      invalid(`Move limit (${ctx.config.maxMovesPerActor}) reached; ${def.label} ignored.`, raw);
      continue;
    }
    const reason = typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason.trim() : '(no reason given)';
    const move: Move = { actor, type: raw.type, target: def.requiresTarget ? raw.target : undefined, reason };
    if (def.scalable && raw.intensity !== undefined) {
      const n = Number(raw.intensity);
      if (!Number.isFinite(n)) {
        invalid(`${def.label} has an invalid intensity; ignored.`, raw);
        continue;
      }
      move.intensity = clamp01(n);
    }
    accepted.push(move);
  }
  return accepted;
}

/** Advance the simulation by one quarter. Does not mutate `prev`. */
export async function step(prev: WorldState, options: StepOptions = {}): Promise<WorldState> {
  const config = options.config ?? DEFAULT_CONFIG;
  const deciders: DeciderMap = { ...createScriptedDeciders(), ...options.deciders };

  const draft = cloneState(prev);
  draft.turn = prev.turn + 1;
  const rng = new Rng(prev.rngState);
  const ctx = createTurnContext(draft, config, rng);

  applyStartOfTurnDecay(draft, config);

  // 2. Regulator acts first.
  if (options.policies) applyPolicyChanges(ctx, options.policies);

  // 3. Actors decide simultaneously, from the same post-policy snapshot.
  const active = ACTOR_IDS.filter((id) => draft.actors[id].status === 'active');
  const decisions: Record<string, Move[]> = {};
  for (const id of active) {
    // Sequential (not Promise.all) so seeded randomness is consumed in a fixed order.
    const view = buildActorView(draft, id, config, prev.turn);
    const decision = await deciders[id].decide(view, { definition: ACTORS[id], config, rng });
    const proposed = Array.isArray(decision) ? decision : decision?.moves;
    if (!Array.isArray(decision) && decision?.memory) {
      draft.actors[id].memory = { ...draft.actors[id].memory, ...structuredClone(decision.memory) };
    }
    decisions[id] = validateMoves(ctx, id, proposed);
  }

  // 4. Log and apply moves.
  for (const id of ACTOR_IDS) {
    const moves = decisions[id] ?? [];
    draft.actors[id].lastMoves = moves.map((m) => m.type);
    for (const move of moves) {
      const def = moveDefinition(id, move.type)!;
      ctx.log({
        kind: 'move',
        actor: id,
        move: move.type,
        target: move.target,
        reason: move.reason,
        message: `${ACTORS[id].name}: ${def.label}${move.target ? ` (${POLICY_LABELS[move.target]})` : ''}${
          move.intensity !== undefined && move.intensity < 1 ? ` at ${Math.round(move.intensity * 100)}%` : ''
        }`,
        data: move.intensity !== undefined ? { intensity: round(move.intensity, 3) } : undefined,
      });
      applyMove(ctx, move);
    }
  }

  // 5. World dynamics.
  updateEconomy(ctx);

  draft.rngState = rng.state;
  return draft;
}

export interface RunOptions extends Omit<StepOptions, 'policies'> {
  turns?: number;
  seed?: number;
  /** Start from an existing state (e.g. a rewound point) instead of a fresh one. */
  initialState?: WorldState;
  /** Policies to request each turn. A fixed PolicySet, or a function of the turn. */
  policies?: PolicySet | ((turn: number, state: WorldState) => PolicySet | undefined);
}

/** Run several turns. Returns the full history, including the starting state at index 0. */
export async function runSimulation(options: RunOptions = {}): Promise<WorldState[]> {
  const config = options.config ?? DEFAULT_CONFIG;
  const start = options.initialState ?? createInitialState(config, options.seed ?? config.seed);
  const turns = options.turns ?? config.turns - start.turn;
  const history: WorldState[] = [start];
  let state = start;
  for (let i = 0; i < turns; i++) {
    const policies = typeof options.policies === 'function' ? options.policies(state.turn + 1, state) : options.policies;
    state = await step(state, { config, deciders: options.deciders, policies });
    history.push(state);
  }
  return history;
}
