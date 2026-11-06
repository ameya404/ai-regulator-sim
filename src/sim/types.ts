/**
 * Core data types for the simulation.
 *
 * Everything in `WorldState` is plain JSON (no classes, functions, Maps, Dates),
 * so a state can be saved with JSON.stringify and restored with JSON.parse.
 *
 * Units (see config.ts for the full list):
 *   money            $B
 *   shares, trust    0..1
 *   jobs             millions of workers
 *   wages            $K per year
 *   politicalCapital 0..100
 *   aiCapability     index, 1.0 = capability at game start
 */

export const SECTORS = ['manufacturing', 'services', 'knowledge', 'healthcare'] as const;
export type Sector = (typeof SECTORS)[number];

export const ACTOR_IDS = ['bigLab', 'startup', 'employer', 'labor', 'public'] as const;
export type ActorId = (typeof ACTOR_IDS)[number];

export const POLICY_IDS = [
  'safetyTesting',
  'liability',
  'startupSubsidy',
  'retrainingFund',
  'automationTax',
  'humanReview',
] as const;
export type PolicyId = (typeof POLICY_IDS)[number];

/** The AI labs that compete for market share. */
export type LabId = 'bigLab' | 'startup';

export interface PolicySetting {
  /** 0 = off, 1 = maximally strict / generous. */
  strength: number;
  /** If true, firms under the small-company revenue threshold are exempt. */
  smallCompanyExemption: boolean;
}

export type PolicySet = Record<PolicyId, PolicySetting>;

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

export const MOVE_IDS = {
  bigLab: ['scaleCompute', 'investSafety', 'cutPrices', 'lobby', 'safetyWashing'],
  startup: ['shipFast', 'raiseFunding', 'openRelease', 'applyForSubsidy', 'conserveCash'],
  employer: ['automate', 'augmentWorkers', 'retrainWorkers', 'complianceTheater', 'holdSteady'],
  labor: ['strike', 'campaign', 'negotiate', 'partnerRetraining', 'standBy'],
  public: ['holdHearing', 'backRegulator', 'cutRegulatorBudget', 'investigate', 'monitor'],
} as const satisfies Record<ActorId, readonly string[]>;

export type MoveIdFor<A extends ActorId> = (typeof MOVE_IDS)[A][number];
export type MoveId = { [A in ActorId]: MoveIdFor<A> }[ActorId];

/** A move chosen by an actor for one turn. */
export interface Move {
  actor: ActorId;
  type: MoveId;
  /** Required by moves that target a policy (e.g. lobby). */
  target?: PolicyId;
  /** Short, human-readable explanation. Shown in the news feed later. */
  reason: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type ActorStatus = 'active' | 'shutDown' | 'acquired';

export interface ActorState {
  id: ActorId;
  money: number;
  status: ActorStatus;
  /** Revenue earned last turn ($B/quarter). Used for small-company exemption. */
  revenue: number;
  /** Net income last turn ($B/quarter). */
  profit: number;
  /** Moves made last turn (actor ids + types only; reasons live in the log). */
  lastMoves: MoveId[];
  /** Free-form memory for decision-makers. Must stay JSON-serializable. */
  memory: Record<string, number | string | boolean>;
}

export interface WorldMetrics {
  aiCapability: number;
  /** Market share of the AI model market. bigLab + startup + other = 1. */
  marketShare: { bigLab: number; startup: number; other: number };
  jobs: Record<Sector, number>;
  wages: Record<Sector, number>;
  /** Displaced workers not currently employed in any of the 4 sectors (millions). */
  displacedWorkers: number;
  /** Workers newly displaced by automation in the most recent quarter (millions). */
  newlyDisplaced: number;
  /** Cumulative jobs automated away by the large employer (millions). */
  automatedJobs: number;
  /** Incidents in the most recent quarter. */
  safetyIncidents: number;
  cumulativeIncidents: number;
  publicTrust: number;
  politicalCapital: number;
  /** Fractional reduction of each policy's effective strength caused by lobbying (0..1). */
  lobbyErosion: Record<PolicyId, number>;
  /** Accumulated safety investment per lab; decays each quarter, lowers incident risk. */
  safetyStock: Record<LabId, number>;
  /** Extra loophole detection probability from congressional investigations (decays). */
  investigationLevel: number;
}

export type LogKind =
  | 'move'
  | 'invalidMove'
  | 'policyChange'
  | 'policyRejected'
  | 'loopholeCaught'
  | 'loopholeUndetected'
  | 'incident'
  | 'funding'
  | 'program'
  | 'startupFailure'
  | 'info';

export interface LogEntry {
  turn: number;
  kind: LogKind;
  actor?: ActorId | 'regulator';
  move?: MoveId;
  target?: PolicyId;
  /** Actor-supplied reason (for moves). */
  reason?: string;
  /** Engine-generated description of what happened. */
  message: string;
  /** Optional numbers for charts / debugging. */
  data?: Record<string, number | string | boolean>;
}

export interface WorldState {
  /** Schema version for save files. */
  version: number;
  /** Turn that produced this state. 0 = initial state, 1..N = after each quarter. */
  turn: number;
  /** Seeded RNG state; carried forward so replays are identical. */
  rngState: number;
  world: WorldMetrics;
  actors: Record<ActorId, ActorState>;
  /** Nominal policy settings chosen by the regulator. */
  policies: PolicySet;
  /** Cumulative event log (all turns up to and including this one). */
  log: LogEntry[];
}

/** A read-only snapshot handed to a decision-maker. */
export interface ActorView {
  turn: number;
  self: Readonly<ActorState>;
  world: Readonly<WorldMetrics>;
  actors: Readonly<Record<ActorId, Readonly<ActorState>>>;
  policies: Readonly<PolicySet>;
  /** Policy strengths after lobbying erosion. What actors actually face. */
  effectiveStrength: Readonly<Record<PolicyId, number>>;
  /** Whether this actor currently qualifies for small-company exemptions. */
  qualifiesAsSmall: boolean;
  /** Log entries from the previous turn. */
  recentEvents: readonly LogEntry[];
}
