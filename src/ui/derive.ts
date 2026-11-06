/**
 * Turn engine history into what the UI shows: chart rows, policy-change
 * markers, cost previews, and end-of-game comparisons. Pure functions.
 */
import {
  ACTORS,
  POLICY_IDS,
  SECTORS,
  averageWage,
  effectiveStrengths,
  policyChangeCost,
  totalJobs,
  type PolicyId,
  type PolicySet,
  type SimConfig,
  type WorldState,
} from '../sim';
import { pct, POLICY_LABELS } from './format';

export interface ChartRow {
  turn: number;
  bigLab: number;
  startup: number;
  other: number;
  manufacturing: number;
  services: number;
  knowledge: number;
  healthcare: number;
  wage_manufacturing: number;
  wage_services: number;
  wage_knowledge: number;
  wage_healthcare: number;
  displaced: number;
  capability: number;
  incidents: number;
  trust: number;
  capital: number;
}

/** One row per turn. Shares and trust in %, jobs and wages indexed (start = 100). */
export function toChartRows(history: readonly WorldState[]): ChartRow[] {
  if (history.length === 0) return [];
  const w0 = history[0].world;
  return history.map((s) => {
    const w = s.world;
    const row: Record<string, number> = {
      turn: s.turn,
      bigLab: w.marketShare.bigLab * 100,
      startup: w.marketShare.startup * 100,
      other: w.marketShare.other * 100,
      displaced: w.displacedWorkers,
      capability: w.aiCapability,
      incidents: w.safetyIncidents,
      trust: w.publicTrust * 100,
      capital: w.politicalCapital,
    };
    for (const sec of SECTORS) {
      row[sec] = (w.jobs[sec] / w0.jobs[sec]) * 100;
      row[`wage_${sec}`] = (w.wages[sec] / w0.wages[sec]) * 100;
    }
    return row as unknown as ChartRow;
  });
}

export interface PolicyDelta {
  policy: PolicyId;
  from: number;
  to: number;
  exemptionChanged: boolean;
  exemption: boolean;
}

export interface PolicyMarker {
  turn: number;
  changes: PolicyDelta[];
}

/** Quarters where enacted policy actually changed (rejected requests don't count). */
export function policyMarkers(history: readonly WorldState[]): PolicyMarker[] {
  const out: PolicyMarker[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1].policies;
    const cur = history[i].policies;
    const changes = POLICY_IDS.filter(
      (p) => prev[p].strength !== cur[p].strength || prev[p].smallCompanyExemption !== cur[p].smallCompanyExemption,
    ).map((p) => ({
      policy: p,
      from: prev[p].strength,
      to: cur[p].strength,
      exemptionChanged: prev[p].smallCompanyExemption !== cur[p].smallCompanyExemption,
      exemption: cur[p].smallCompanyExemption,
    }));
    if (changes.length) out.push({ turn: history[i].turn, changes });
  }
  return out;
}

export interface CostPreviewRow {
  policy: PolicyId;
  changed: boolean;
  cost: number;
  /** Would the engine accept it, given the changes before it in order? */
  affordable: boolean;
}

export interface CostPreview {
  rows: Record<PolicyId, CostPreviewRow>;
  totalCost: number;
  available: number;
  /** Capital left after all affordable changes go through. */
  remaining: number;
  anyRejected: boolean;
}

/** Mirrors the engine: changes are paid for in POLICY_IDS order; unaffordable ones are rejected. */
export function previewPolicyCosts(state: WorldState, pending: PolicySet, config: SimConfig): CostPreview {
  const costs = policyChangeCost(state.policies, pending, config);
  let remaining = state.world.politicalCapital;
  let totalCost = 0;
  let anyRejected = false;
  const rows = {} as Record<PolicyId, CostPreviewRow>;
  for (const p of POLICY_IDS) {
    const cur = state.policies[p];
    const changed = cur.strength !== pending[p].strength || cur.smallCompanyExemption !== pending[p].smallCompanyExemption;
    const cost = changed ? costs[p] : 0;
    const affordable = !changed || cost <= remaining + 1e-9;
    if (changed && affordable) remaining -= cost;
    if (changed && !affordable) anyRejected = true;
    if (changed) totalCost += cost;
    rows[p] = { policy: p, changed, cost, affordable };
  }
  return { rows, totalCost, available: state.world.politicalCapital, remaining, anyRejected };
}

/** Enacted vs effective (after lobbying) strength, for the "show hidden" view. */
export function strengthGap(state: WorldState): Record<PolicyId, { set: number; effective: number }> {
  const eff = effectiveStrengths(state.world, state.policies);
  return Object.fromEntries(POLICY_IDS.map((p) => [p, { set: state.policies[p].strength, effective: eff[p] }])) as Record<
    PolicyId,
    { set: number; effective: number }
  >;
}

// ---------------------------------------------------------------------------
// End-of-game comparison against a "do nothing" counterfactual
// ---------------------------------------------------------------------------

export interface ComparisonRow {
  label: string;
  yours: string;
  baseline: string;
  diff: string;
  /** +1 if your result is better, -1 worse, 0 neutral. */
  verdict: 1 | -1 | 0;
}

const startupStatus = (s: WorldState) =>
  s.actors.startup.status === 'active' ? `Alive · ${pct(s.world.marketShare.startup, 1)}` : s.actors.startup.status === 'acquired' ? 'Acquired' : 'Shut down';

export function compareOutcomes(yours: WorldState, base: WorldState): ComparisonRow[] {
  const row = (label: string, a: number, b: number, fmt: (x: number) => string, dfmt: (x: number) => string, higherIsBetter: boolean | null): ComparisonRow => {
    const d = a - b;
    const verdict = higherIsBetter === null || Math.abs(d) < 1e-6 ? 0 : (d > 0) === higherIsBetter ? 1 : -1;
    return { label, yours: fmt(a), baseline: fmt(b), diff: dfmt(d), verdict };
  };
  const sgn = (x: number, f: (y: number) => string) => (x >= 0 ? '+' : '−') + f(Math.abs(x));
  return [
    row('Jobs (4 sectors)', totalJobs(yours), totalJobs(base), (x) => `${x.toFixed(1)}M`, (d) => sgn(d, (y) => `${y.toFixed(2)}M`), true),
    row('Displaced workers', yours.world.displacedWorkers, base.world.displacedWorkers, (x) => `${x.toFixed(2)}M`, (d) => sgn(d, (y) => `${y.toFixed(2)}M`), false),
    row('Average wage', averageWage(yours), averageWage(base), (x) => `$${x.toFixed(1)}K`, (d) => sgn(d, (y) => `$${y.toFixed(1)}K`), true),
    row('Total AI incidents', yours.world.cumulativeIncidents, base.world.cumulativeIncidents, (x) => x.toFixed(0), (d) => sgn(d, (y) => y.toFixed(0)), false),
    row('Public trust', yours.world.publicTrust, base.world.publicTrust, (x) => pct(x), (d) => sgn(d * 100, (y) => `${y.toFixed(0)} pts`), true),
    row('AI capability', yours.world.aiCapability, base.world.aiCapability, (x) => `${x.toFixed(2)}×`, (d) => sgn(d, (y) => y.toFixed(2)), null),
    row('Frontier Lab share', yours.world.marketShare.bigLab, base.world.marketShare.bigLab, (x) => pct(x, 1), (d) => sgn(d * 100, (y) => `${y.toFixed(1)} pts`), null),
    {
      label: 'Upstart AI',
      yours: startupStatus(yours),
      baseline: startupStatus(base),
      diff: '',
      verdict: 0,
    },
  ];
}

/** Plain-language "unintended consequences" callouts. */
export function insights(yours: WorldState, base: WorldState): string[] {
  const out: string[] = [];
  const shareGap = (yours.world.marketShare.bigLab - base.world.marketShare.bigLab) * 100;
  if (shareGap >= 3) {
    out.push(
      `Your rules entrenched the incumbent: Frontier Lab holds ${pct(yours.world.marketShare.bigLab)} of the market, vs ${pct(base.world.marketShare.bigLab)} if you had done nothing.`,
    );
  } else if (shareGap <= -3) {
    out.push(`Competition grew: Frontier Lab's share is ${Math.abs(shareGap).toFixed(0)} points lower than if you had done nothing.`);
  }
  if (yours.actors.startup.status !== 'active' && base.actors.startup.status === 'active') {
    out.push(`Upstart AI would have survived without your policies. Under them it was ${yours.actors.startup.status === 'acquired' ? 'bought by Frontier Lab' : 'forced to shut down'}.`);
  } else if (yours.actors.startup.status === 'active' && base.actors.startup.status !== 'active') {
    out.push('Your policies kept Upstart AI alive. Without them it would have failed.');
  }
  const incidentGap = yours.world.cumulativeIncidents - base.world.cumulativeIncidents;
  if (Math.abs(incidentGap) >= 3) {
    out.push(incidentGap < 0 ? `${-incidentGap} fewer AI incidents than doing nothing.` : `${incidentGap} more AI incidents than doing nothing.`);
  }
  const jobsGap = totalJobs(yours) - totalJobs(base);
  if (Math.abs(jobsGap) >= 0.3) {
    out.push(jobsGap > 0 ? `${jobsGap.toFixed(1)}M more people employed than doing nothing.` : `${(-jobsGap).toFixed(1)}M fewer people employed than doing nothing.`);
  }

  // Reveal what was hidden.
  const log = yours.log;
  const unseen = (actor: string, move: string) => log.filter((e) => e.kind === 'loopholeUndetected' && e.actor === actor && e.move === move).length;
  const caught = log.filter((e) => e.kind === 'loopholeCaught').length;
  const lobbied = unseen('bigLab', 'lobby');
  const washed = unseen('bigLab', 'safetyWashing');
  const theater = unseen('employer', 'complianceTheater');
  if (lobbied) out.push(`Revealed: ${ACTORS.bigLab.name} lobbied against your rules ${lobbied} time${lobbied === 1 ? '' : 's'} without being caught.`);
  if (washed) out.push(`Revealed: ${ACTORS.bigLab.name} gamed its safety tests for ${washed} quarter${washed === 1 ? '' : 's'} undetected.`);
  if (theater) out.push(`Revealed: ${ACTORS.employer.name} faked human review for ${theater} quarter${theater === 1 ? '' : 's'} undetected.`);
  if (caught) out.push(`You exposed ${caught} loophole${caught === 1 ? '' : 's'}.`);

  const rejected = log.filter((e) => e.kind === 'policyRejected').length;
  if (rejected) out.push(`${rejected} policy change${rejected === 1 ? ' was' : 's were'} blocked for lack of political capital.`);
  return out;
}

export { POLICY_LABELS };
