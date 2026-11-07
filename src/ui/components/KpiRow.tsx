import { totalJobs, type WorldState } from '../../sim';
import { yearIncidents, yearSlices } from '../game';
import { useTween } from '../useTween';

interface KpiProps {
  label: string;
  sub: string;
  value: number;
  format: (v: number) => string;
  delta?: number;
  deltaText?: (d: number) => string;
  upIs: 'good' | 'bad' | 'neutral';
}

function Kpi({ label, sub, value, format, delta, deltaText, upIs }: KpiProps) {
  const shown = useTween(value);
  let tone = 'flat';
  let arrow = '';
  if (delta !== undefined && Math.abs(delta) > 1e-6) {
    arrow = delta > 0 ? '▲' : '▼';
    tone = upIs === 'neutral' ? 'flat' : (delta > 0) === (upIs === 'good') ? 'good' : 'bad';
  }
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-main">
        <span className="kpi-value">{format(shown)}</span>
        <span className="kpi-sub">{sub}</span>
      </div>
      <div className={`kpi-delta ${tone}`}>
        {delta === undefined ? (
          <span className="muted">Changes appear after your first year</span>
        ) : Math.abs(delta) < 1e-6 ? (
          'Same as last year'
        ) : (
          <>
            <span aria-hidden="true">{arrow}</span> {(deltaText ?? format)(Math.abs(delta))} vs last year
            <span className="sr-only">{tone === 'good' ? ' (better)' : tone === 'bad' ? ' (worse)' : ''}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function KpiRow({ history }: { history: readonly WorldState[] }) {
  const current = history[history.length - 1];
  const yearAgo = current.turn >= 4 ? history[current.turn - 4] : undefined;
  const years = yearSlices(history);
  const lastYear = years[years.length - 1];
  const yearBefore = years[years.length - 2];

  return (
    <section className="kpis" aria-label="Key numbers">
      <Kpi
        label="Jobs"
        sub="million people working"
        value={totalJobs(current)}
        format={(v) => v.toFixed(1)}
        delta={yearAgo ? totalJobs(current) - totalJobs(yearAgo) : undefined}
        deltaText={(d) => `${d.toFixed(2)}M`}
        upIs="good"
      />
      <Kpi
        label="AI safety incidents"
        sub={lastYear ? `in ${lastYear.calendarYear}` : 'so far'}
        value={lastYear ? yearIncidents(lastYear) : 0}
        format={(v) => v.toFixed(0)}
        delta={lastYear && yearBefore ? yearIncidents(lastYear) - yearIncidents(yearBefore) : undefined}
        upIs="bad"
      />
      <Kpi
        label="Big AI company's market share"
        sub="of all AI sales"
        value={current.world.marketShare.bigLab * 100}
        format={(v) => `${v.toFixed(0)}%`}
        delta={yearAgo ? (current.world.marketShare.bigLab - yearAgo.world.marketShare.bigLab) * 100 : undefined}
        deltaText={(d) => `${d.toFixed(1)} pts`}
        upIs="neutral"
      />
    </section>
  );
}
