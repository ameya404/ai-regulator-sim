/**
 * Transient, per-turn scratchpad. Moves write their effects here; the economy
 * reads them when it updates the world. Never saved — only `draft` (the new
 * WorldState being built) is persisted.
 */
import type { SimConfig } from './config';
import type { Rng } from './rng';
import { ACTOR_IDS, type ActorId, type LabId, type LogEntry, type WorldState } from './types';

export interface TurnContext {
  config: SimConfig;
  rng: Rng;
  /** The new state being built for this turn. Mutated in place (it is a fresh clone). */
  draft: WorldState;

  /** Share momentum from moves (logit units). */
  momentum: Record<LabId, number>;
  /** Extra frontier capability growth this quarter from moves. */
  capabilityBoost: number;
  /** Incident-risk multipliers from moves. */
  riskMultiplier: Record<LabId, number>;
  /** Fraction of revenue lost to price cuts. */
  revenueLoss: Record<LabId, number>;
  /** Fraction of R&D spend cut this quarter. */
  rdCut: Record<LabId, number>;
  /** One-off spending (move costs, fines, acquisition) per actor ($B). */
  spend: Record<ActorId, number>;
  /** One-off income (funding, subsidy) per actor ($B). */
  income: Record<ActorId, number>;

  employerAutomates: boolean;
  employerAugments: boolean;
  /** Workers directly re-employed by the employer's retraining move (millions). */
  employerRetrained: number;
  strike: boolean;
  /** Multiplier on retraining-fund effectiveness. */
  retrainingMultiplier: number;
  /** Fractional wage growth added in all sectors. */
  wageBoost: number;
  startupAppliedForSubsidy: boolean;

  /** Fraction of safety-testing burden the big lab is dodging (0 if compliant or caught). */
  safetyAvoided: number;
  /** Fraction of human-review burden the employer is dodging. */
  reviewAvoided: number;

  trustDelta: number;
  capitalDelta: number;

  log: (entry: Omit<LogEntry, 'turn'>) => void;
}

const perActor = (v: number) => Object.fromEntries(ACTOR_IDS.map((id) => [id, v])) as Record<ActorId, number>;

export function createTurnContext(draft: WorldState, config: SimConfig, rng: Rng): TurnContext {
  return {
    config,
    rng,
    draft,
    momentum: { bigLab: 0, startup: 0 },
    capabilityBoost: 0,
    riskMultiplier: { bigLab: 1, startup: 1 },
    revenueLoss: { bigLab: 0, startup: 0 },
    rdCut: { bigLab: 0, startup: 0 },
    spend: perActor(0),
    income: perActor(0),
    employerAutomates: false,
    employerAugments: false,
    employerRetrained: 0,
    strike: false,
    retrainingMultiplier: 1,
    wageBoost: 0,
    startupAppliedForSubsidy: false,
    safetyAvoided: 0,
    reviewAvoided: 0,
    trustDelta: 0,
    capitalDelta: 0,
    log: (entry) => draft.log.push({ turn: draft.turn, ...entry }),
  };
}
