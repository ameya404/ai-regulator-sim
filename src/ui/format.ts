/** Formatting and headline generation. Pure functions; no React. */
import { ACTORS, POLICY_LABELS, type LogEntry, type MoveId, type PolicyId } from '../sim';

/** The game starts at the end of 2026; turn 1 is Q1 2027. */
const START_YEAR = 2027;

export function quarterLabel(turn: number): string {
  if (turn <= 0) return 'Start';
  const q = ((turn - 1) % 4) + 1;
  const y = START_YEAR + Math.floor((turn - 1) / 4);
  return `Q${q} ${y}`;
}

export function shortQuarter(turn: number): string {
  if (turn <= 0) return 'Start';
  const q = ((turn - 1) % 4) + 1;
  const y = (START_YEAR + Math.floor((turn - 1) / 4)) % 100;
  return `Q${q} '${String(y).padStart(2, '0')}`;
}

export const money = (b: number, d = 1) => `$${b.toFixed(d)}B`;
export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
export const signed = (x: number, d = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`;

export const POLICY_SHORT: Record<PolicyId, string> = {
  safetyTesting: 'SAFETY',
  liability: 'LIABILITY',
  startupSubsidy: 'SUBSIDY',
  retrainingFund: 'RETRAIN',
  automationTax: 'AUTO TAX',
  humanReview: 'REVIEW',
};

export const POLICY_HELP: Record<PolicyId, string> = {
  safetyTesting: 'Labs must test models before release.',
  liability: 'Firms pay for harms their AI causes.',
  startupSubsidy: 'Public money for startups and open research.',
  retrainingFund: 'Public money to move displaced workers into new jobs.',
  automationTax: 'Firms pay per job they automate away.',
  humanReview: 'A human must review automated decisions.',
};

export { POLICY_LABELS };

const HEADLINE: Record<MoveId, string> = {
  scaleCompute: '{a} pours billions into a bigger training run',
  investSafety: '{a} ramps up safety research',
  cutPrices: '{a} slashes prices',
  lobby: '{a} quietly lobbies against {p}',
  safetyWashing: '{a} games its safety tests',
  shipFast: '{a} rushes out a new model',
  raiseFunding: '{a} pitches investors',
  openRelease: '{a} open-sources a model',
  applyForSubsidy: '{a} applies for the research subsidy',
  conserveCash: '{a} cuts R&D to save cash',
  automate: '{a} replaces workers with AI',
  augmentWorkers: '{a} equips its workers with AI tools',
  retrainWorkers: '{a} funds retraining for displaced workers',
  complianceTheater: '{a} rubber-stamps its "human review"',
  holdSteady: '{a} holds steady',
  strike: '{a} calls a strike',
  campaign: '{a} launches a public campaign for stronger rules',
  negotiate: '{a} bargains for higher wages',
  partnerRetraining: '{a} partners on the retraining fund',
  standBy: '{a} stands by',
  holdHearing: 'Congress holds hearings on AI harms',
  backRegulator: 'Congress backs the regulator',
  cutRegulatorBudget: "Congress cuts the regulator's budget",
  investigate: 'Congress opens an investigation into AI firms',
  monitor: 'Congress watches and waits',
};

export const LOOPHOLE_MOVES: readonly MoveId[] = ['lobby', 'safetyWashing', 'complianceTheater'];
const QUIET_MOVES: readonly MoveId[] = ['holdSteady', 'standBy', 'monitor'];

export type Tone = 'critical' | 'serious' | 'warning' | 'policy' | 'good' | 'neutral';

export interface NewsItem {
  id: string;
  turn: number;
  tone: Tone;
  /** Short category tag shown before the headline (never color alone). */
  tag: string;
  headline: string;
  reason?: string;
  /** True if a real regulator wouldn't see this (only shown with "show hidden"). */
  hidden: boolean;
}

/** Would a real regulator see this event? */
export function isHiddenEntry(e: LogEntry): boolean {
  if (e.kind === 'loopholeUndetected' || e.kind === 'invalidMove') return true;
  if (e.kind === 'move' && e.move && (LOOPHOLE_MOVES.includes(e.move) || QUIET_MOVES.includes(e.move))) return true;
  return false;
}

export function toNewsItem(e: LogEntry, index: number): NewsItem {
  const base = { id: `${e.turn}-${index}`, turn: e.turn, hidden: isHiddenEntry(e), reason: e.reason };
  switch (e.kind) {
    case 'move': {
      const name = e.actor && e.actor !== 'regulator' ? ACTORS[e.actor].name : '';
      const tmpl = e.move ? HEADLINE[e.move] : e.message;
      const headline = tmpl.replace('{a}', name).replace('{p}', e.target ? POLICY_LABELS[e.target].toLowerCase() : 'a policy');
      const tone: Tone = e.move === 'strike' || e.move === 'holdHearing' ? 'warning' : 'neutral';
      return { ...base, tone, tag: actorTag(e), headline };
    }
    case 'policyChange':
      return { ...base, tone: 'policy', tag: 'POLICY', headline: e.message.replace(/^Enacted: /, 'You enacted: ') };
    case 'policyRejected':
      return { ...base, tone: 'warning', tag: 'REJECTED', headline: e.message.replace(/^Rejected: /, 'Not enough capital: ') };
    case 'loopholeCaught':
      return { ...base, tone: 'critical', tag: 'EXPOSED', headline: e.message };
    case 'loopholeUndetected':
      return { ...base, tone: 'neutral', tag: 'UNSEEN', headline: e.message };
    case 'startupFailure':
      return { ...base, tone: 'critical', tag: 'COLLAPSE', headline: e.message };
    case 'incident':
      return { ...base, tone: 'serious', tag: 'INCIDENTS', headline: e.message };
    case 'funding':
      return { ...base, tone: e.data?.success ? 'good' : 'neutral', tag: 'FUNDING', headline: e.message };
    case 'program':
      return { ...base, tone: 'warning', tag: 'BUDGET', headline: e.message };
    case 'invalidMove':
      return { ...base, tone: 'neutral', tag: 'INVALID', headline: e.message };
    default:
      return { ...base, tone: 'neutral', tag: 'NEWS', headline: e.message };
  }
}

function actorTag(e: LogEntry): string {
  switch (e.actor) {
    case 'bigLab':
      return 'LAB';
    case 'startup':
      return 'STARTUP';
    case 'employer':
      return 'EMPLOYER';
    case 'labor':
      return 'LABOR';
    case 'public':
      return 'CONGRESS';
    default:
      return 'NEWS';
  }
}

/** News for the feed, newest quarter first; hidden items only when revealed. */
export function buildNews(log: readonly LogEntry[], showHidden: boolean): NewsItem[] {
  const items = log.map(toNewsItem).filter((n) => showHidden || !n.hidden);
  // Newest quarter first; within a quarter keep the engine's order (policy → moves → outcomes).
  return items.sort((a, b) => b.turn - a.turn);
}
