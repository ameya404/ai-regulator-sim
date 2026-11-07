/**
 * Turn engine history into what the UI shows. Pure functions.
 */
import { averageWage, effectiveStrengths, totalJobs, type WorldState } from '../sim';
import { calendarYear, LEVEL_LABEL, levelOf, QUARTERS_PER_YEAR, RULE_TEXT, RULES, yearIncidents, yearSlices, type Level, type RuleId } from './game';
import { pct, people } from './format';

export interface QuarterRow {
  /** Quarter index on the x-axis (0 = start, 20 = end of year 5). */
  x: number;
  bigLab: number;
  startup: number;
  other: number;
  jobs: number;
}

export function toQuarterRows(history: readonly WorldState[]): QuarterRow[] {
  return history.map((s) => ({
    x: s.turn,
    bigLab: s.world.marketShare.bigLab * 100,
    startup: s.world.marketShare.startup * 100,
    other: s.world.marketShare.other * 100,
    jobs: totalJobs(s),
  }));
}

export interface YearRow {
  /** Middle of the year on the quarter axis, so bars sit between year boundaries. */
  x: number;
  year: number;
  incidents: number;
}

export function toYearRows(history: readonly WorldState[]): YearRow[] {
  return yearSlices(history).map((y) => ({ x: (y.year - 0.5) * QUARTERS_PER_YEAR, year: y.calendarYear, incidents: yearIncidents(y) }));
}

export interface RuleChange {
  rule: RuleId;
  from: Level;
  to: Level;
  skipChanged: boolean;
  skip: boolean;
}

export interface PolicyMarker {
  /** Position on the quarter axis: the start of the year the change took effect. */
  x: number;
  calendarYear: number;
  changes: RuleChange[];
}

/** Years where you changed one of the visible rules. */
export function policyMarkers(history: readonly WorldState[]): PolicyMarker[] {
  const out: PolicyMarker[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1].policies;
    const cur = history[i].policies;
    const changes = RULES.filter(
      (r) => prev[r].strength !== cur[r].strength || prev[r].smallCompanyExemption !== cur[r].smallCompanyExemption,
    ).map((r) => ({
      rule: r,
      from: levelOf(prev[r].strength),
      to: levelOf(cur[r].strength),
      skipChanged: prev[r].smallCompanyExemption !== cur[r].smallCompanyExemption,
      skip: cur[r].smallCompanyExemption,
    }));
    if (changes.length) {
      const x = history[i].turn - 1;
      out.push({ x, calendarYear: calendarYear(Math.floor(x / QUARTERS_PER_YEAR) + 1), changes });
    }
  }
  return out;
}

export function describeChange(c: RuleChange): string {
  const parts: string[] = [];
  if (c.from !== c.to) parts.push(`${LEVEL_LABEL[c.from]} → ${LEVEL_LABEL[c.to]}`);
  if (c.skipChanged) parts.push(c.skip ? 'small companies may skip it' : 'small companies must comply');
  return `${RULE_TEXT[c.rule].name}: ${parts.join(', ')}`;
}

// ---------------------------------------------------------------------------
// End of game
// ---------------------------------------------------------------------------

export interface ComparisonRow {
  label: string;
  yours: string;
  baseline: string;
  diff: string;
  /** +1 better for society, -1 worse, 0 neither. */
  verdict: 1 | -1 | 0;
}

const totalIncidents = (h: readonly WorldState[]) => h.reduce((a, s) => a + (s.turn > 0 ? s.world.safetyIncidents : 0), 0);

const startupFate = (s: WorldState) =>
  s.actors.startup.status === 'active' ? `Survived · ${pct(s.world.marketShare.startup)}` : s.actors.startup.status === 'acquired' ? 'Bought by big AI co.' : 'Shut down';

export function compareOutcomes(yours: readonly WorldState[], base: readonly WorldState[]): ComparisonRow[] {
  const a = yours[yours.length - 1];
  const b = base[base.length - 1];
  const row = (label: string, x: number, y: number, fmt: (v: number) => string, dfmt: (d: number) => string, higherIsBetter: boolean | null): ComparisonRow => {
    const d = x - y;
    const verdict = higherIsBetter === null || Math.abs(d) < 1e-6 ? 0 : (d > 0) === higherIsBetter ? 1 : -1;
    return { label, yours: fmt(x), baseline: fmt(y), diff: dfmt(d), verdict };
  };
  const sign = (d: number) => (d >= 0 ? '+' : '−');
  return [
    row('People with jobs', totalJobs(a), totalJobs(b), (v) => `${v.toFixed(1)}M`, (d) => `${sign(d)}${Math.abs(d).toFixed(1)}M`, true),
    row('People out of work', a.world.displacedWorkers, b.world.displacedWorkers, (v) => `${v.toFixed(1)}M`, (d) => `${sign(d)}${Math.abs(d).toFixed(1)}M`, false),
    row('Average yearly pay', averageWage(a), averageWage(b), (v) => `$${v.toFixed(1)}K`, (d) => `${sign(d)}$${Math.abs(d).toFixed(1)}K`, true),
    row('AI safety incidents', totalIncidents(yours), totalIncidents(base), (v) => v.toFixed(0), (d) => `${sign(d)}${Math.abs(d).toFixed(0)}`, false),
    row("Big AI co.'s market share", a.world.marketShare.bigLab, b.world.marketShare.bigLab, (v) => pct(v), (d) => `${sign(d)}${Math.abs(d * 100).toFixed(0)} pts`, null),
    { label: 'The startup', yours: startupFate(a), baseline: startupFate(b), diff: '', verdict: 0 },
  ];
}

/** Plain-language "what your rules did" callouts (nothing about hidden cheating). */
export function insights(yours: readonly WorldState[], base: readonly WorldState[]): string[] {
  const a = yours[yours.length - 1];
  const b = base[base.length - 1];
  const out: string[] = [];
  const shareGap = (a.world.marketShare.bigLab - b.world.marketShare.bigLab) * 100;
  if (shareGap >= 3) out.push(`Your rules made the big AI company more powerful: it ended with ${pct(a.world.marketShare.bigLab)} of the market instead of ${pct(b.world.marketShare.bigLab)}.`);
  else if (shareGap <= -3) out.push(`Your rules helped smaller AI companies compete: the big AI company ended ${Math.round(-shareGap)} points lower.`);
  if (a.actors.startup.status !== 'active' && b.actors.startup.status === 'active') out.push('Without your rules the startup would have survived.');
  if (a.actors.startup.status === 'active' && b.actors.startup.status !== 'active') out.push('Your rules kept the startup alive. Without them it would have failed.');
  const inc = totalIncidents(yours) - totalIncidents(base);
  if (Math.abs(inc) >= 3) out.push(inc < 0 ? `${-inc} fewer AI safety incidents than doing nothing.` : `${inc} more AI safety incidents than doing nothing.`);
  const jobs = totalJobs(a) - totalJobs(b);
  if (Math.abs(jobs) >= 0.2) out.push(jobs > 0 ? `${people(jobs)} more people have jobs than if you had done nothing.` : `${people(-jobs)} fewer people have jobs than if you had done nothing.`);
  return out;
}

/** "What you didn't see": cheating, lobbying, and how much weaker your rules really were. */
export function hiddenReveal(history: readonly WorldState[]): string[] {
  const log = history[history.length - 1].log;
  const moves = (move: string) => log.filter((e) => e.kind === 'move' && e.move === move).length;
  const caught = (move: string) => log.filter((e) => e.kind === 'loopholeCaught' && e.move === move);
  const out: string[] = [];

  const lobbied = moves('lobby');
  if (lobbied) {
    const c = caught('lobby').length;
    out.push(`The big AI company secretly lobbied against your rules ${lobbied} time${lobbied === 1 ? '' : 's'}${c ? ` and was caught ${c} time${c === 1 ? '' : 's'}` : ' and was never caught'}.`);
  }
  const washed = moves('safetyWashing');
  if (washed) {
    const c = caught('safetyWashing').length;
    out.push(`It also gamed its safety tests in ${washed} of ${history.length - 1} quarters, passing the tests without really being safer${c ? ` (caught ${c} time${c === 1 ? '' : 's'})` : ''}.`);
  }
  const theater = moves('complianceTheater');
  if (theater) out.push(`MegaCorp faked human review of its AI in ${theater} quarter${theater === 1 ? '' : 's'}.`);

  // How strong were your rules really, on average, while they were on?
  for (const rule of RULES) {
    const ratios = history
      .filter((s) => s.turn > 0 && s.policies[rule].strength > 0)
      .map((s) => effectiveStrengths(s.world, s.policies)[rule] / s.policies[rule].strength);
    if (!ratios.length) continue;
    const avg = ratios.reduce((x, y) => x + y, 0) / ratios.length;
    if (avg < 0.97) out.push(`Because of lobbying, your ${RULE_TEXT[rule].name.toLowerCase()} worked at only about ${Math.round(avg * 100)}% of the strength you chose.`);
  }

  const fines = log.filter((e) => e.kind === 'loopholeCaught').reduce((a, e) => a + Number(e.data?.fine ?? 0), 0);
  if (fines > 0) out.push(`Companies paid $${fines.toFixed(1)}B in fines when they were caught.`);
  if (!out.length) out.push('Nothing. Every company played by your rules this time.');
  return out;
}
