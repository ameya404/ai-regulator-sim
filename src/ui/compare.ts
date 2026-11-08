/**
 * Path A vs Path B: labels, key numbers, chart rows and a 2-sentence verdict.
 * Pure functions; deterministic; never mentions hidden mechanics.
 */
import { totalJobs, type WorldState } from '../sim';
import { calendarYear, LEVEL_LABEL, levelOf, QUARTERS_PER_YEAR, RULES, yearIncidents, yearSlices, type Level, type RuleId } from './game';
import { pct, people } from './format';

const RULE_SHORT: Record<RuleId, string> = {
  safetyTesting: 'Safety',
  automationTax: 'Automation tax',
  retrainingFund: 'Retraining',
};

interface Setting {
  level: Level;
  skip: boolean;
}

const same = (x: Setting, y: Setting) => x.level === y.level && x.skip === y.skip;

/** The setting of each visible rule for each year played (from the first quarter of the year). */
function yearlySettings(history: readonly WorldState[], rule: RuleId): Setting[] {
  const out: Setting[] = [];
  for (let t = 1; t < history.length; t += QUARTERS_PER_YEAR) {
    const p = history[t].policies[rule];
    out.push({ level: levelOf(p.strength), skip: rule === 'safetyTesting' && p.strength > 0 && p.smallCompanyExemption });
  }
  return out;
}

const describe = (s: Setting) => `${LEVEL_LABEL[s.level].toLowerCase()}${s.skip ? ', small companies skip' : ''}`;

/** "Safety strict, small companies skip · Retraining strict from 2029". */
export function pathLabel(history: readonly WorldState[]): string {
  const parts: string[] = [];
  for (const rule of RULES) {
    const years = yearlySettings(history, rule);
    if (years.every((s) => s.level === 'off')) continue;
    // Compress into runs of identical settings.
    const runs: { from: number; s: Setting }[] = [];
    years.forEach((s, i) => {
      if (!runs.length || !same(runs[runs.length - 1].s, s)) runs.push({ from: i + 1, s });
    });
    const text = runs
      .map((r, i) => {
        if (i === 0) return r.s.level === 'off' ? null : describe(r.s);
        return `${describe(r.s)} from ${calendarYear(r.from)}`;
      })
      .filter(Boolean)
      .join(', ');
    parts.push(`${RULE_SHORT[rule]} ${text}`);
  }
  return parts.length ? parts.join(' · ') : 'No rules';
}

export interface KeyNumbers {
  jobs: number;
  incidents: number;
  bigShare: number;
  startup: 'alive' | 'acquired' | 'shutDown';
  startupShare: number;
}

export function keyNumbers(history: readonly WorldState[]): KeyNumbers {
  const end = history[history.length - 1];
  return {
    jobs: totalJobs(end),
    incidents: yearSlices(history).reduce((a, y) => a + yearIncidents(y), 0),
    bigShare: end.world.marketShare.bigLab,
    startup: end.actors.startup.status === 'active' ? 'alive' : end.actors.startup.status,
    startupShare: end.world.marketShare.startup,
  };
}

/** How big a difference must be to count, in the table's ✓/✗ marks and in the verdict alike. */
export const SIGNIFICANT = {
  jobs: 0.2, // million people
  incidents: 3, // over 5 years
  bigShare: 2, // percentage points
  startupShare: 1.5, // percentage points
};

export interface CompareRow {
  label: string;
  a: string;
  b: string;
  diff: string;
  /** +1 if B is better for society than A, -1 worse, 0 neither. */
  verdict: 1 | -1 | 0;
}

export function compareTable(a: readonly WorldState[], b: readonly WorldState[]): CompareRow[] {
  const ka = keyNumbers(a);
  const kb = keyNumbers(b);
  const sign = (d: number) => (d >= 0 ? '+' : '−');
  const v = (d: number, higherIsBetter: boolean | null, eps: number): 1 | -1 | 0 =>
    higherIsBetter === null || Math.abs(d) < eps ? 0 : (d > 0) === higherIsBetter ? 1 : -1;
  const dj = kb.jobs - ka.jobs;
  const di = kb.incidents - ka.incidents;
  const ds = (kb.bigShare - ka.bigShare) * 100;
  return [
    { label: 'Jobs (end of 2031)', a: `${ka.jobs.toFixed(1)}M`, b: `${kb.jobs.toFixed(1)}M`, diff: `${sign(dj)}${Math.abs(dj).toFixed(1)}M`, verdict: v(dj, true, SIGNIFICANT.jobs) },
    { label: 'AI safety incidents (5 years)', a: String(ka.incidents), b: String(kb.incidents), diff: `${sign(di)}${Math.abs(di)}`, verdict: v(di, false, SIGNIFICANT.incidents) },
    { label: "Big AI company's market share", a: pct(ka.bigShare), b: pct(kb.bigShare), diff: `${sign(ds)}${Math.abs(ds).toFixed(0)} pts`, verdict: 0 },
  ];
}

// ---------------------------------------------------------------------------
// Chart rows
// ---------------------------------------------------------------------------

export interface CompareQuarterRow {
  x: number;
  shareA?: number;
  shareB?: number;
  jobsA?: number;
  jobsB?: number;
}

export function compareQuarterRows(a: readonly WorldState[], b: readonly WorldState[]): CompareQuarterRow[] {
  const n = Math.max(a.length, b.length);
  return Array.from({ length: n }, (_, i) => ({
    x: i,
    shareA: a[i] ? a[i].world.marketShare.bigLab * 100 : undefined,
    shareB: b[i] ? b[i].world.marketShare.bigLab * 100 : undefined,
    jobsA: a[i] ? totalJobs(a[i]) : undefined,
    jobsB: b[i] ? totalJobs(b[i]) : undefined,
  }));
}

export interface CompareYearRow {
  x: number;
  year: number;
  a?: number;
  b?: number;
}

export function compareYearRows(a: readonly WorldState[], b: readonly WorldState[]): CompareYearRow[] {
  const ya = yearSlices(a);
  const yb = yearSlices(b);
  return Array.from({ length: Math.max(ya.length, yb.length) }, (_, i) => ({
    x: (i + 0.5) * QUARTERS_PER_YEAR,
    year: calendarYear(i + 1),
    a: ya[i] ? yearIncidents(ya[i]) : undefined,
    b: yb[i] ? yearIncidents(yb[i]) : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

const NOUN: Record<RuleId, { the: string; a: (level: string) => string }> = {
  safetyTesting: { the: 'safety testing', a: (l) => `${l} safety testing` },
  automationTax: { the: 'the automation tax', a: (l) => `a ${l} automation tax` },
  retrainingFund: { the: 'the retraining fund', a: (l) => `a ${l} retraining fund` },
};

/** What Path B changed, as the subject of a sentence ("Letting small companies skip safety testing"). */
export function changePhrase(a: readonly WorldState[], b: readonly WorldState[]): string | null {
  const changed = RULES.filter((r) => {
    const sa = yearlySettings(a, r);
    const sb = yearlySettings(b, r);
    return sa.length !== sb.length || sa.some((s, i) => !same(s, sb[i]));
  });
  if (changed.length === 0) return null;
  if (changed.length > 1) return "Path B's rules";
  const rule = changed[0];
  const sa = yearlySettings(a, rule);
  const sb = yearlySettings(b, rule);
  const constant = (xs: Setting[]) => xs.every((s) => same(s, xs[0]));
  if (!constant(sa) || !constant(sb)) return `Changing when you used ${NOUN[rule].the}`;
  const [x, y] = [sa[0], sb[0]];
  if (x.level === y.level && x.skip !== y.skip) {
    return y.skip ? 'Letting small companies skip safety testing' : 'Making small companies do safety testing too';
  }
  const lvl = (l: Level) => LEVEL_LABEL[l].toLowerCase();
  if (x.level === 'off') return `Adding ${NOUN[rule].a(lvl(y.level))}`;
  if (y.level === 'off') return `Dropping ${NOUN[rule].the}`;
  return `Making ${NOUN[rule].the} ${lvl(y.level)} instead of ${lvl(x.level)}`;
}

interface Effect {
  score: number;
  /** +1 good for society, -1 bad, used to pick "and" vs "but". */
  valence: 1 | -1;
  /** Counts toward "which path came out ahead" (jobs, incidents, the startup surviving). */
  judged: boolean;
  /** Verb phrase: "<change> kept the startup alive". */
  verb: string;
  /** Clause: "…, but there were 12 more AI incidents". */
  clause: string;
}

const priceCuts = (h: readonly WorldState[]) => h[h.length - 1].log.filter((e) => e.kind === 'move' && e.move === 'cutPrices').length;

/** Highest startup share in a path, and the calendar year it happened. */
function startupPeak(h: readonly WorldState[]): { share: number; year: number } {
  let best = { share: 0, turn: 0 };
  for (const s of h) if (s.world.marketShare.startup > best.share) best = { share: s.world.marketShare.startup, turn: s.turn };
  return { share: best.share, year: calendarYear(Math.max(1, Math.ceil(best.turn / QUARTERS_PER_YEAR))) };
}

function effects(a: readonly WorldState[], b: readonly WorldState[]): Effect[] {
  const ka = keyNumbers(a);
  const kb = keyNumbers(b);
  const out: Effect[] = [];

  if (ka.startup !== kb.startup) {
    if (kb.startup === 'alive') out.push({ score: 100, valence: 1, judged: true, verb: 'kept the startup alive', clause: 'the startup survived' });
    else if (kb.startup === 'acquired')
      out.push({ score: 100, valence: -1, judged: true, verb: 'led the big AI company to buy up the startup', clause: 'the big AI company bought up the startup' });
    else out.push({ score: 100, valence: -1, judged: true, verb: 'drove the startup out of business', clause: 'the startup went out of business' });
  } else if (kb.startup === 'alive') {
    // Both survived: did the startup do better or worse?
    const dss = (kb.startupShare - ka.startupShare) * 100;
    const pa = startupPeak(a);
    const pb = startupPeak(b);
    const peakStory = (pb.share - pa.share) * 100 >= 2 && (pb.share - kb.startupShare) * 100 >= 2;
    if (peakStory) {
      out.push({
        score: 40 + (pb.share - pa.share) * 300,
        valence: 1,
        judged: false,
        verb: `helped the startup grow to ${pct(pb.share)} of the market by ${pb.year}`,
        clause: `the startup grew to ${pct(pb.share)} of the market by ${pb.year}`,
      });
    } else if (Math.abs(dss) >= SIGNIFICANT.startupShare) {
      out.push(
        dss > 0
          ? { score: 28 + dss * 3, valence: 1, judged: false, verb: `helped the startup end with ${pct(kb.startupShare)} of the market instead of ${pct(ka.startupShare)}`, clause: `the startup ended with ${pct(kb.startupShare)} of the market instead of ${pct(ka.startupShare)}` }
          : { score: 28 + -dss * 3, valence: -1, judged: false, verb: `shrank the startup to ${pct(kb.startupShare)} of the market instead of ${pct(ka.startupShare)}`, clause: `the startup ended with only ${pct(kb.startupShare)} of the market instead of ${pct(ka.startupShare)}` },
      );
    }
  }

  const di = kb.incidents - ka.incidents;
  if (Math.abs(di) >= SIGNIFICANT.incidents) {
    out.push(
      di < 0
        ? { score: 30 + -di, valence: 1, judged: true, verb: `prevented ${-di} AI safety incidents`, clause: `there were ${-di} fewer AI safety incidents` }
        : { score: 30 + di, valence: -1, judged: true, verb: `led to ${di} more AI safety incidents`, clause: `there were ${di} more AI safety incidents` },
    );
  }

  const dj = kb.jobs - ka.jobs;
  if (Math.abs(dj) >= SIGNIFICANT.jobs) {
    out.push(
      dj > 0
        ? { score: 30 + dj * 20, valence: 1, judged: true, verb: `kept ${people(dj)} more people in work`, clause: `${people(dj)} more people had jobs` }
        : { score: 30 + -dj * 20, valence: -1, judged: true, verb: `cost about ${people(-dj)} jobs`, clause: `${people(-dj)} fewer people had jobs` },
    );
  }

  const ds = (kb.bigShare - ka.bigShare) * 100;
  // A fight-back counts if B's lead peaked at a significant gap, even if it narrowed by the end.
  const peakLead = Math.max(...b.map((s, i) => (a[i] ? (s.world.marketShare.bigLab - a[i].world.marketShare.bigLab) * 100 : 0)));
  const fought = ds > 0 && priceCuts(b) > priceCuts(a) && Math.max(ds, peakLead) >= SIGNIFICANT.bigShare;
  if (Math.abs(ds) >= SIGNIFICANT.bigShare || fought) {
    const ending = `${pct(kb.bigShare)} of the market instead of ${pct(ka.bigShare)}`;
    const still = ds < SIGNIFICANT.bigShare ? 'still ' : '';
    out.push(
      ds > 0
        ? {
            score: 25 + ds * 2,
            valence: -1,
            judged: false,
            verb: fought ? `made the big AI company fight back with price cuts, ${still}ending with ${ending}` : `helped the big AI company grow to ${ending}`,
            clause: fought ? `the big AI company fought back with price cuts and ${still}ended with ${ending}` : `the big AI company ended with ${ending}`,
          }
        : { score: 25 + -ds * 2, valence: 1, judged: false, verb: `held the big AI company to ${ending}`, clause: `the big AI company ended with ${ending}` },
    );
  }

  // The backfire story leads: the startup surged, then the big AI company fought back
  // with price cuts and ended bigger. Rank that pair first, in that order.
  const surge = out.find((e) => e.verb.startsWith('helped the startup grow to'));
  const fightBack = out.find((e) => e.clause.includes('fought back with price cuts'));
  if (surge && fightBack) {
    surge.score = 90;
    fightBack.score = 85;
  }

  return out.sort((x, y) => y.score - x.score);
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Exactly two plain-English sentences on what Path B's change did, compared with Path A. */
export function verdict(a: readonly WorldState[], b: readonly WorldState[]): [string, string] {
  const change = changePhrase(a, b);
  if (!change) {
    return ['Both paths used the same rules, so they turned out the same.', 'Try changing one rule in Path B to see what it does.'];
  }
  const fx = effects(a, b);
  if (fx.length === 0) {
    return [`${change} made little difference.`, "Jobs, AI safety incidents and the big AI company's market share all ended close to Path A."];
  }
  const [e1, e2, e3] = fx;
  const first = e2 ? `${change} ${e1.verb}, ${e2.valence === e1.valence ? 'and' : 'but'} ${e2.clause}.` : `${change} ${e1.verb}.`;

  const judged = fx.filter((e) => e.judged);
  let second: string;
  if (e3) {
    second = e3.valence === e1.valence ? `It also ${e3.verb}.` : `Meanwhile, ${e3.clause}.`;
  } else if (judged.length === 0) {
    second = 'Jobs and AI safety incidents ended about the same in both paths.';
  } else {
    const good = judged.filter((e) => e.valence > 0).length;
    const bad = judged.length - good;
    second = bad === 0 ? 'For jobs and safety, Path B came out ahead.' : good === 0 ? 'For jobs and safety, Path A came out ahead.' : 'Neither path was better on everything: that is the trade-off.';
  }
  return [capitalize(first), capitalize(second)];
}
