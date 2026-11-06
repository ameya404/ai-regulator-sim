/**
 * Quick command-line sanity check: runs the simulation with a fixed policy set
 * and prints a turn-by-turn summary table.
 *
 *   npm run sim
 *   npm run sim -- --safetyTesting=1
 *   npm run sim -- --safetyTesting=1:exempt --humanReview=0.6 --seed=7
 *   npm run sim -- --automationTax=0.5 --retrainingFund=0.8 --events
 *
 * Options:
 *   --<policy>=<strength>[:exempt]   policy strength 0..1, ":exempt" adds the small-company exemption
 *   --seed=<n>                       RNG seed (default from config)
 *   --turns=<n>                      number of quarters (default 20)
 *   --events                         also print every log entry (moves with reasons, catches, ...)
 *   --json                           print the final saved state as JSON instead of a table
 */
import {
  ACTORS,
  DEFAULT_CONFIG,
  POLICY_IDS,
  POLICY_LABELS,
  averageWage,
  policySet,
  runSimulation,
  serializeState,
  totalJobs,
  type PolicyId,
  type WorldState,
} from '../src/sim/index';

function parseArgs(argv: string[]) {
  const policies: Partial<Record<PolicyId, { strength: number; smallCompanyExemption: boolean }>> = {};
  let seed = DEFAULT_CONFIG.seed;
  let turns = DEFAULT_CONFIG.turns;
  let events = false;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    if (!arg.startsWith('--')) continue;
    arg = arg.slice(2);
    let [key, value] = arg.split('=') as [string, string | undefined];
    if (value === undefined && argv[i + 1] && !argv[i + 1].startsWith('--')) value = argv[++i];
    if (key === 'events') events = true;
    else if (key === 'json') json = true;
    else if (key === 'seed') seed = Number(value);
    else if (key === 'turns') turns = Number(value);
    else if ((POLICY_IDS as readonly string[]).includes(key)) {
      const [s, flag] = (value ?? '1').split(':');
      const strength = Number(s);
      if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw new Error(`--${key}: strength must be 0..1`);
      policies[key as PolicyId] = { strength, smallCompanyExemption: flag === 'exempt' };
    } else {
      throw new Error(`Unknown option --${key}. Policies: ${POLICY_IDS.join(', ')}`);
    }
  }
  return { policies: policySet(policies), seed, turns, events, json };
}

const f = (x: number, d = 2) => x.toFixed(d);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function row(s: WorldState, prevJobs: number): string[] {
  const w = s.world;
  const a = s.actors;
  const startup = a.startup.status === 'active' ? f(a.startup.money) : a.startup.status === 'acquired' ? 'ACQ' : 'DEAD';
  const jobs = totalJobs(s);
  return [
    String(s.turn),
    f(w.aiCapability, 3),
    pct(w.marketShare.bigLab),
    pct(w.marketShare.startup),
    f(jobs, 1),
    (jobs - prevJobs >= 0 ? '+' : '') + f(jobs - prevJobs, 2),
    f(w.displacedWorkers, 2),
    f(averageWage(s), 1),
    String(w.safetyIncidents),
    f(w.publicTrust, 3),
    f(w.politicalCapital, 1),
    f(a.bigLab.money, 1),
    startup,
    f(a.employer.money, 1),
    f(a.labor.money, 2),
    f(a.public.money, 2),
    s.log
      .filter((e) => e.turn === s.turn && ['loopholeCaught', 'policyRejected', 'startupFailure'].includes(e.kind))
      .map((e) => (e.kind === 'loopholeCaught' ? `CAUGHT:${e.move}` : e.kind === 'policyRejected' ? `REJECTED:${e.target}` : `STARTUP:${e.data?.outcome}`))
      .join(' '),
  ];
}

function printTable(header: string[], rows: string[][]) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((c, i) => (i === r.length - 1 ? c : c.padStart(widths[i]))).join('  ');
  console.log(line(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((r) => console.log(line(r)));
}

async function main() {
  const { policies, seed, turns, events, json } = parseArgs(process.argv.slice(2));
  const history = await runSimulation({ seed, turns, policies });
  const final = history[history.length - 1];

  if (json) {
    console.log(serializeState(final));
    return;
  }

  const active = POLICY_IDS.filter((p) => policies[p].strength > 0)
    .map((p) => `${POLICY_LABELS[p]}=${policies[p].strength}${policies[p].smallCompanyExemption ? ' (exempt small)' : ''}`)
    .join(', ');
  console.log(`\nUnintended Consequences — seed ${seed}, ${turns} quarters`);
  console.log(`Requested policies: ${active || 'none'}\n`);

  const header = ['T', 'Cap', 'Lab%', 'Start%', 'Jobs', 'ΔJobs', 'Displ', 'Wage', 'Inc', 'Trust', 'PolCap', 'Lab$', 'Start$', 'Emp$', 'Labor$', 'Pub$', 'Notes'];
  const rows: string[][] = [];
  for (let i = 0; i < history.length; i++) rows.push(row(history[i], totalJobs(history[Math.max(0, i - 1)])));
  printTable(header, rows);
  console.log('\nUnits: money $B · jobs/displaced millions · wage $K/yr · trust 0..1 · capital 0..100');

  // Move frequency summary.
  const counts = new Map<string, number>();
  for (const e of final.log) if (e.kind === 'move') counts.set(`${e.actor}.${e.move}`, (counts.get(`${e.actor}.${e.move}`) ?? 0) + 1);
  console.log('\nMoves chosen:');
  for (const id of Object.keys(ACTORS) as (keyof typeof ACTORS)[]) {
    const parts = [...counts].filter(([k]) => k.startsWith(id + '.')).map(([k, n]) => `${k.split('.')[1]}×${n}`);
    console.log(`  ${ACTORS[id].name.padEnd(18)} ${parts.join(', ') || '-'}`);
  }

  if (events) {
    console.log('\nEvent log:');
    for (const e of final.log) {
      const who = e.actor ? `[${e.actor}]` : '';
      console.log(`  T${String(e.turn).padStart(2)} ${e.kind.padEnd(18)} ${who.padEnd(11)} ${e.message}${e.reason ? ` — "${e.reason}"` : ''}`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
