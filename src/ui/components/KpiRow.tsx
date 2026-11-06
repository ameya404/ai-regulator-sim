import { averageWage, totalJobs, type WorldState } from '../../sim';
import { useTween } from '../useTween';

interface KpiProps {
  label: string;
  value: number;
  format: (v: number) => string;
  /** Change since last quarter (undefined on turn 0). */
  delta?: number;
  deltaFormat?: (v: number) => string;
  /** Is an increase good, bad, or neither? */
  upIs: 'good' | 'bad' | 'neutral';
  /** Optional 0..1 fill for a meter under the number. */
  meter?: number;
  hint?: string;
}

function Kpi({ label, value, format, delta, deltaFormat, upIs, meter, hint }: KpiProps) {
  const shown = useTween(value);
  const shownMeter = useTween(meter ?? 0);
  let tone = 'flat';
  let arrow = '•';
  if (delta !== undefined && Math.abs(delta) > 1e-6) {
    const up = delta > 0;
    arrow = up ? '▲' : '▼';
    tone = upIs === 'neutral' ? 'flat' : (up === (upIs === 'good')) ? 'good' : 'bad';
  }
  const fmt = deltaFormat ?? format;
  return (
    <div className="kpi" title={hint}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{format(shown)}</div>
      {meter !== undefined && (
        <div className="meter" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(1, shownMeter)) * 100}%` }} />
        </div>
      )}
      <div className={`kpi-delta ${tone}`}>
        {delta === undefined ? (
          <span className="muted">Starting value</span>
        ) : (
          <>
            <span aria-hidden="true">{arrow}</span> {Math.abs(delta) < 1e-6 ? 'No change' : `${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta))}`}
            <span className="sr-only">{tone === 'good' ? ' (improving)' : tone === 'bad' ? ' (worsening)' : ''}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function KpiRow({ current, previous }: { current: WorldState; previous?: WorldState }) {
  const w = current.world;
  const p = previous?.world;
  const d = (a: number, b?: number) => (b === undefined ? undefined : a - b);
  return (
    <section className="kpis" aria-label="Key indicators">
      <Kpi
        label="Political capital"
        value={w.politicalCapital}
        format={(v) => v.toFixed(0)}
        deltaFormat={(v) => v.toFixed(1)}
        delta={d(w.politicalCapital, p?.politicalCapital)}
        upIs="good"
        meter={w.politicalCapital / 100}
        hint="Spend it to change policy. Out of 100."
      />
      <Kpi
        label="Public trust in AI"
        value={w.publicTrust * 100}
        format={(v) => `${v.toFixed(0)}%`}
        deltaFormat={(v) => `${v.toFixed(1)} pts`}
        delta={p ? (w.publicTrust - p.publicTrust) * 100 : undefined}
        upIs="good"
        meter={w.publicTrust}
      />
      <Kpi
        label="Jobs · 4 sectors"
        value={totalJobs(current)}
        format={(v) => `${v.toFixed(1)}M`}
        deltaFormat={(v) => `${v.toFixed(2)}M`}
        delta={previous ? totalJobs(current) - totalJobs(previous) : undefined}
        upIs="good"
      />
      <Kpi
        label="Displaced workers"
        value={w.displacedWorkers}
        format={(v) => `${v.toFixed(2)}M`}
        delta={d(w.displacedWorkers, p?.displacedWorkers)}
        upIs="bad"
      />
      <Kpi
        label="Average wage"
        value={averageWage(current)}
        format={(v) => `$${v.toFixed(1)}K`}
        delta={previous ? averageWage(current) - averageWage(previous) : undefined}
        deltaFormat={(v) => `$${v.toFixed(2)}K`}
        upIs="good"
      />
      <Kpi
        label="AI incidents · quarter"
        value={w.safetyIncidents}
        format={(v) => v.toFixed(0)}
        delta={d(w.safetyIncidents, p?.safetyIncidents)}
        upIs="bad"
        hint={`${w.cumulativeIncidents} in total so far`}
      />
      <Kpi
        label="AI capability"
        value={w.aiCapability}
        format={(v) => `${v.toFixed(2)}×`}
        delta={d(w.aiCapability, p?.aiCapability)}
        deltaFormat={(v) => v.toFixed(3)}
        upIs="neutral"
        hint="Frontier capability; 1.00× = today."
      />
    </section>
  );
}
