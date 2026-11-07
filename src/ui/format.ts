/** Plain-language labels, number formatting and news headlines. Pure functions; no React. */
import { ACTORS, type ActorId, type LogEntry, type MoveId, type PolicyId } from '../sim';
import { calendarYearOfTurn, LEVEL_LABEL, levelOf, RULE_TEXT, START_YEAR, type RuleId } from './game';

export const ACTOR_LABEL: Record<ActorId, string> = {
  bigLab: 'Big AI company',
  startup: 'Startup',
  employer: 'Big employer',
  labor: "Workers' unions",
  public: 'Congress & the public',
};

/** "Big AI company (Frontier Lab)" */
export const actorFullName = (id: ActorId) =>
  id === 'labor' || id === 'public' ? ACTOR_LABEL[id] : `${ACTOR_LABEL[id]} (${ACTORS[id].name})`;

export function quarterLabel(turn: number): string {
  if (turn <= 0) return `Start of ${START_YEAR}`;
  return `Q${((turn - 1) % 4) + 1} ${calendarYearOfTurn(turn)}`;
}

export const money = (b: number, d = 1) => `$${b.toFixed(d)}B`;
export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

/** Millions of people in words: 0.82 → "820,000", 1.24 → "1.2 million". */
export function people(millions: number): string {
  const m = Math.abs(millions);
  if (m >= 0.995) return `${m.toFixed(1)} million`;
  const n = Math.round((m * 1_000_000) / 10_000) * 10_000;
  return n.toLocaleString('en-US');
}

const HEADLINE: Partial<Record<MoveId, string>> = {
  scaleCompute: '{a} pours billions into bigger AI models',
  investSafety: '{a} spends more on AI safety',
  cutPrices: '{a} cuts its prices',
  shipFast: '{a} rushes out a new AI model',
  raiseFunding: '{a} asks investors for money',
  openRelease: '{a} gives away a free, open AI model',
  applyForSubsidy: '{a} applies for a government grant',
  conserveCash: '{a} cuts spending to save cash',
  automate: '{a} replaces workers with AI',
  augmentWorkers: '{a} gives its workers AI tools',
  retrainWorkers: '{a} pays to retrain workers',
  strike: '{a} go on strike',
  campaign: '{a} campaign for stronger rules',
  negotiate: '{a} bargain for higher pay',
  partnerRetraining: '{a} help run the retraining fund',
  holdHearing: 'Congress holds hearings on AI harms',
};

/**
 * Events the player never sees during the game: cheating and lobbying (even when
 * caught), anything about the hidden political-capital system, filler moves,
 * and engine diagnostics. All of it is revealed on the end screen instead.
 */
const HIDDEN_MOVES: readonly MoveId[] = [
  'lobby',
  'safetyWashing',
  'complianceTheater',
  'investigate',
  'backRegulator',
  'cutRegulatorBudget',
  'holdSteady',
  'standBy',
  'monitor',
];

export function isHiddenDuringGame(e: LogEntry): boolean {
  switch (e.kind) {
    case 'loopholeCaught':
    case 'loopholeUndetected':
    case 'invalidMove':
    case 'policyRejected':
    case 'program':
      return true;
    case 'move':
      return !e.move || HIDDEN_MOVES.includes(e.move);
    default:
      return false;
  }
}

export type Tone = 'critical' | 'serious' | 'policy' | 'good' | 'neutral';

export interface NewsItem {
  id: string;
  turn: number;
  tone: Tone;
  headline: string;
  reason?: string;
}

function ruleChangeHeadline(e: LogEntry): string {
  const rule = e.target as RuleId | undefined;
  const text = rule && rule in RULE_TEXT ? RULE_TEXT[rule].name : 'a rule';
  const strength = Number(e.data?.strength ?? 0);
  const skip = e.data?.exemption === true && rule === 'safetyTesting' ? ' (small companies may skip it)' : '';
  return `You set ${text.toLowerCase()} to ${LEVEL_LABEL[levelOf(strength)]}${skip}.`;
}

export function toNewsItem(e: LogEntry, index: number): NewsItem {
  const base = { id: `${e.turn}-${index}`, turn: e.turn, reason: e.reason };
  switch (e.kind) {
    case 'move': {
      const who = e.actor && e.actor !== 'regulator' ? actorFullName(e.actor) : '';
      const tmpl = (e.move && HEADLINE[e.move]) ?? e.message;
      return { ...base, tone: e.move === 'strike' ? 'serious' : 'neutral', headline: tmpl.replace('{a}', who) };
    }
    case 'policyChange':
      return { ...base, tone: 'policy', headline: ruleChangeHeadline(e) };
    case 'startupFailure':
      return {
        ...base,
        tone: 'critical',
        headline: e.data?.outcome === 'acquired' ? 'The startup ran out of money and was bought by the big AI company.' : 'The startup ran out of money and shut down.',
      };
    case 'incident':
      return { ...base, tone: 'serious', headline: e.message };
    case 'funding':
      return {
        ...base,
        tone: e.data?.success ? 'good' : 'neutral',
        headline: e.data?.success ? 'The startup raised new money from investors.' : "Investors turned the startup down.",
      };
    default:
      return { ...base, tone: 'neutral', headline: e.message };
  }
}

/** News the player may see, newest first. */
export function buildNews(log: readonly LogEntry[]): NewsItem[] {
  return log
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !isHiddenDuringGame(e))
    .map(({ e, i }) => toNewsItem(e, i))
    .sort((a, b) => b.turn - a.turn);
}

export type { PolicyId };
