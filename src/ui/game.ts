/**
 * The simplified game layered on top of the engine:
 *   - 5 turns of one year each (the engine still steps in quarters: 4 per year)
 *   - 3 visible rules with Off / Light / Strict levels
 *   - political capital hidden: a config override makes every rule change free
 *
 * Nothing here changes the engine; it only chooses config values and how the
 * UI groups quarters into years.
 */
import { createInitialState, makeConfig, POLICY_IDS, step, type PolicyId, type PolicySet, type SimConfig, type WorldState } from '../sim';

export const QUARTERS_PER_YEAR = 4;
export const START_YEAR = 2027;

export const RULES = ['safetyTesting', 'automationTax', 'retrainingFund'] as const satisfies readonly PolicyId[];
export type RuleId = (typeof RULES)[number];

export const LEVELS = ['off', 'light', 'strict'] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_STRENGTH: Record<Level, number> = { off: 0, light: 0.5, strict: 1 };
export const LEVEL_LABEL: Record<Level, string> = { off: 'Off', light: 'Light', strict: 'Strict' };

export function levelOf(strength: number): Level {
  if (strength <= 0.25) return 'off';
  if (strength < 0.75) return 'light';
  return 'strict';
}

export const RULE_TEXT: Record<RuleId, { name: string; short: string; explain: string }> = {
  safetyTesting: {
    name: 'Safety testing',
    short: 'SAFETY',
    explain: 'AI companies must test new AI before release. Big companies can afford this more easily.',
  },
  automationTax: {
    name: 'Automation tax',
    short: 'AUTO TAX',
    explain: 'Companies pay a tax for every job they replace with AI.',
  },
  retrainingFund: {
    name: 'Retraining fund',
    short: 'RETRAINING',
    explain: 'The government pays to train people who lost their jobs for new ones.',
  },
};

/** Only safety testing offers the small-company option in this version. */
export const RULE_WITH_EXEMPTION: RuleId = 'safetyTesting';

/** Engine config for the simple game: rule changes cost no political capital, so none are rejected. */
export function simpleGameConfig(): SimConfig {
  return makeConfig({
    politicalCapital: {
      changeCost: Object.fromEntries(POLICY_IDS.map((p) => [p, 0])) as Record<PolicyId, number>,
      exemptionToggleCost: 0,
    },
  });
}

export const totalYears = (config: SimConfig) => Math.ceil(config.turns / QUARTERS_PER_YEAR);

/** Number of whole years played so far (turn 4 → 1 year). */
export const yearsPlayed = (state: WorldState) => Math.floor(state.turn / QUARTERS_PER_YEAR);

/** Calendar year for game year n (1-based). */
export const calendarYear = (n: number) => START_YEAR + n - 1;

/** Calendar year a quarter (turn ≥ 1) belongs to. */
export const calendarYearOfTurn = (turn: number) => START_YEAR + Math.floor((Math.max(1, turn) - 1) / QUARTERS_PER_YEAR);

export interface YearSlice {
  /** 1-based game year. */
  year: number;
  calendarYear: number;
  /** State at the start of the year (end of the previous one). */
  start: WorldState;
  /** The 4 quarterly states of this year, in order. */
  quarters: WorldState[];
  end: WorldState;
}

/** Group a quarterly history into completed years. */
export function yearSlices(history: readonly WorldState[]): YearSlice[] {
  const out: YearSlice[] = [];
  for (let y = 1; y * QUARTERS_PER_YEAR < history.length; y++) {
    const startIdx = (y - 1) * QUARTERS_PER_YEAR;
    const endIdx = y * QUARTERS_PER_YEAR;
    out.push({
      year: y,
      calendarYear: calendarYear(y),
      start: history[startIdx],
      quarters: history.slice(startIdx + 1, endIdx + 1),
      end: history[endIdx],
    });
  }
  return out;
}

/** Total AI safety incidents over a year's quarters. */
export const yearIncidents = (slice: YearSlice) => slice.quarters.reduce((a, s) => a + s.world.safetyIncidents, 0);

// ---------------------------------------------------------------------------
// Aligned luck: every quarter starts from a random state derived from (seed, quarter),
// not from however many random numbers earlier quarters happened to use. Two paths
// with the same seed therefore face the same luck quarter by quarter, so their
// differences come from the rules, not from random drift.
// ---------------------------------------------------------------------------

export function quarterRngState(seed: number, turn: number): number {
  let h = Math.imul(seed ^ 0x2545f491, 0x9e3779b1) ^ Math.imul((turn + 0x632be5ab) | 0, 0x85ebca6b);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Play `quarters` engine quarters from `start` with aligned luck. Returns the new states. */
export async function playQuarters(
  start: WorldState,
  quarters: number,
  config: SimConfig,
  seed: number,
  policies: PolicySet | ((turn: number) => PolicySet),
): Promise<WorldState[]> {
  const out: WorldState[] = [];
  let state = start;
  for (let i = 0; i < quarters; i++) {
    const turn = state.turn + 1;
    const rules = typeof policies === 'function' ? policies(turn) : policies;
    state = await step({ ...state, rngState: quarterRngState(seed, turn) }, { config, policies: rules });
    out.push(state);
  }
  return out;
}

/** A full game (start state + every quarter) with aligned luck. */
export async function playGame(
  config: SimConfig,
  seed: number,
  policies: PolicySet | ((turn: number) => PolicySet),
  start?: WorldState,
): Promise<WorldState[]> {
  const s0 = start ?? createInitialState(config, seed);
  return [s0, ...(await playQuarters(s0, config.turns - s0.turn, config, seed, policies))];
}
