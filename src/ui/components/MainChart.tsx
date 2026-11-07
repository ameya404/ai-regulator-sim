import { useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { describeChange, type PolicyMarker, type QuarterRow, type YearRow } from '../derive';
import { calendarYear, QUARTERS_PER_YEAR, RULE_TEXT, LEVEL_LABEL } from '../game';
import { quarterLabel } from '../format';
import { AXIS, GRID, INK_2, MARKER, MUTED, SERIES, SURFACE } from '../theme';

const reducedMotion = (() => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
})();
const ANIM = { isAnimationActive: !reducedMotion, animationDuration: 800, animationEasing: 'ease-out' as const };

type View = 'share' | 'jobs' | 'incidents';
const VIEWS: { id: View; label: string; subtitle: string }[] = [
  { id: 'share', label: 'Market share', subtitle: 'Who sells the most AI? Share of all AI sales, %' },
  { id: 'jobs', label: 'Jobs', subtitle: 'Million people working in the 4 biggest industries' },
  { id: 'incidents', label: 'AI safety incidents', subtitle: 'Incidents per year' },
];

const SHARE_SERIES = [
  { key: 'bigLab', label: 'Big AI company', color: SERIES[0] },
  { key: 'startup', label: 'Startup', color: SERIES[1] },
  { key: 'other', label: 'Other companies', color: SERIES[2] },
] as const;

interface Props {
  quarters: QuarterRow[];
  years: YearRow[];
  markers: PolicyMarker[];
  totalQuarters: number;
}

function markerText(m: PolicyMarker): string {
  if (m.changes.length > 1) return `${m.changes.length} RULES CHANGED`;
  const c = m.changes[0];
  if (c.from === c.to) return `${RULE_TEXT[c.rule].short}: ${c.skip ? 'SMALL SKIP' : 'NO SKIP'}`;
  return `${RULE_TEXT[c.rule].short}: ${LEVEL_LABEL[c.to].toUpperCase()}`;
}

function MarkerLabel({ viewBox, marker, tier }: { viewBox?: { x: number; y: number }; marker: PolicyMarker; tier: number }) {
  if (!viewBox) return null;
  const text = markerText(marker);
  const y = viewBox.y - 30 + tier * 19;
  const width = text.length * 8.6 + 16;
  // Keep the first label inside the plot instead of hanging off the left edge.
  const cx = Math.max(viewBox.x, width / 2 + 4);
  return (
    <g>
      <rect x={cx - width / 2} y={y - 13} width={width} height={21} rx={4} fill={SURFACE} stroke={MARKER} strokeOpacity={0.6} />
      <text x={cx} y={y + 3} textAnchor="middle" fill={MARKER} fontSize={13} fontWeight={700} letterSpacing={0.4}>
        {text}
      </text>
    </g>
  );
}

interface TipProps {
  active?: boolean;
  label?: number | string;
  payload?: readonly { dataKey?: string | number; value?: number | string; color?: string }[];
}

export function MainChart({ quarters, years, markers, totalQuarters }: Props) {
  const [view, setView] = useState<View>('share');
  const [table, setTable] = useState(false);
  const meta = VIEWS.find((v) => v.id === view)!;
  const yearCount = Math.ceil(totalQuarters / QUARTERS_PER_YEAR);
  const yearTicks = Array.from({ length: yearCount }, (_, i) => (i + 0.5) * QUARTERS_PER_YEAR);
  const boundaries = Array.from({ length: yearCount - 1 }, (_, i) => (i + 1) * QUARTERS_PER_YEAR);
  const margin = { top: 46, right: 24, bottom: 6, left: 6 };

  const Tip = ({ active, label, payload }: TipProps) => {
    if (!active || !payload?.length) return null;
    const x = Number(label);
    const title = view === 'incidents' ? String(calendarYear(Math.floor(x / QUARTERS_PER_YEAR) + 1)) : quarterLabel(x);
    const marker = view === 'incidents' ? markers.find((m) => Math.floor(m.x / QUARTERS_PER_YEAR) === Math.floor(x / QUARTERS_PER_YEAR)) : markers.find((m) => m.x === x);
    return (
      <div className="chart-tooltip">
        <div className="tt-title">{title}</div>
        {view === 'share' &&
          [...SHARE_SERIES].reverse().map((s) => {
            const p = payload.find((q) => q.dataKey === s.key);
            return p ? (
              <div key={s.key} className="tt-row">
                <span className="swatch" style={{ background: s.color }} />
                <span>{s.label}</span>
                <span className="tt-val">{Number(p.value).toFixed(1)}%</span>
              </div>
            ) : null;
          })}
        {view === 'jobs' && (
          <div className="tt-row">
            <span className="swatch" style={{ background: SERIES[0] }} />
            <span>People working</span>
            <span className="tt-val">{Number(payload[0].value).toFixed(2)}M</span>
          </div>
        )}
        {view === 'incidents' && (
          <div className="tt-row">
            <span className="swatch" style={{ background: SERIES[0] }} />
            <span>Incidents</span>
            <span className="tt-val">{payload[0].value}</span>
          </div>
        )}
        {marker && (
          <div className="tt-policies">
            <div className="tt-sub">You changed</div>
            {marker.changes.map((c) => (
              <div key={c.rule}>◆ {describeChange(c)}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const xAxis = (
    <XAxis
      dataKey="x"
      type="number"
      domain={[0, totalQuarters]}
      ticks={yearTicks}
      tickFormatter={(x: number) => String(calendarYear(Math.floor(x / QUARTERS_PER_YEAR) + 1))}
      stroke={AXIS}
      tick={{ fill: MUTED, fontSize: 16, fontWeight: 600 }}
      tickLine={false}
      allowDecimals
    />
  );
  const overlays = (
    <>
      {boundaries.map((b) => (
        <ReferenceLine key={`b${b}`} x={b} stroke={GRID} strokeWidth={1} />
      ))}
      {markers.map((m, i) => (
        <ReferenceLine key={`m${m.x}`} x={m.x} stroke={MARKER} strokeWidth={2.5} strokeOpacity={0.8} label={<MarkerLabel marker={m} tier={i % 2} />} />
      ))}
      <Tooltip content={(p) => <Tip {...(p as TipProps)} />} cursor={view === 'incidents' ? { fill: 'rgba(255,255,255,0.05)' } : { stroke: INK_2, strokeWidth: 1 }} isAnimationActive={false} />
    </>
  );
  const yAxis = (fmt: (v: number) => string, domain: [number | string, number | string], ticks?: number[]) => (
    <YAxis domain={domain as never} ticks={ticks} tickFormatter={fmt} stroke={AXIS} tick={{ fill: MUTED, fontSize: 16 }} tickLine={false} axisLine={false} width={64} />
  );

  let chart: React.ReactElement;
  if (view === 'share') {
    chart = (
      <AreaChart data={quarters} margin={margin}>
        <CartesianGrid vertical={false} stroke={GRID} />
        {xAxis}
        {yAxis((v) => `${v}%`, [0, 100], [0, 25, 50, 75, 100])}
        {SHARE_SERIES.map((s) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stackId="1" stroke={SURFACE} strokeWidth={2} fill={s.color} fillOpacity={0.92} {...ANIM} />
        ))}
        {overlays}
      </AreaChart>
    );
  } else if (view === 'jobs') {
    chart = (
      <LineChart data={quarters} margin={margin}>
        <CartesianGrid vertical={false} stroke={GRID} />
        {xAxis}
        {yAxis((v) => `${v.toFixed(0)}M`, ['dataMin - 1', 'dataMax + 1'])}
        <Line type="monotone" dataKey="jobs" name="People working" stroke={SERIES[0]} strokeWidth={4} dot={false} activeDot={{ r: 7, stroke: SURFACE, strokeWidth: 2 }} {...ANIM} />
        {overlays}
      </LineChart>
    );
  } else {
    chart = (
      <BarChart data={years} margin={margin}>
        <CartesianGrid vertical={false} stroke={GRID} />
        {xAxis}
        {yAxis((v) => v.toFixed(0), [0, 'auto'])}
        <Bar dataKey="incidents" name="Incidents" fill={SERIES[0]} radius={[4, 4, 0, 0]} barSize={56} {...ANIM} />
        {overlays}
      </BarChart>
    );
  }

  return (
    <section className="panel chart-card" aria-label="Chart">
      <div className="chart-head">
        <div className="chart-title">
          <label className="view-picker">
            <span className="sr-only">Chart to show</span>
            <select value={view} onChange={(e) => setView(e.target.value as View)}>
              {VIEWS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <p>{meta.subtitle}</p>
        </div>
        <div className="chart-tools">
          {view === 'share' && (
            <ul className="legend" aria-label="Legend">
              {SHARE_SERIES.map((s) => (
                <li key={s.key}>
                  <span className="swatch" style={{ background: s.color }} />
                  {s.label}
                </li>
              ))}
            </ul>
          )}
          <span className="marker-key-note">
            <span className="marker-key" aria-hidden="true" /> you changed a rule
          </span>
          <button className="btn tiny ghost" onClick={() => setTable((t) => !t)} aria-pressed={table}>
            {table ? 'Chart' : 'Table'}
          </button>
        </div>
      </div>
      {table ? (
        <ChartTable view={view} quarters={quarters} years={years} />
      ) : (
        <div className="chart-body">
          <ResponsiveContainer width="100%" height="100%">
            {chart}
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function ChartTable({ view, quarters, years }: { view: View; quarters: QuarterRow[]; years: YearRow[] }) {
  if (view === 'incidents') {
    return (
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Year</th>
              <th className="num">AI safety incidents</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.year}>
                <td>{y.year}</td>
                <td className="num">{y.incidents}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  // One row per year end keeps the table short.
  const rows = quarters.filter((q) => q.x % QUARTERS_PER_YEAR === 0);
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>When</th>
            {view === 'share' ? SHARE_SERIES.map((s) => <th key={s.key} className="num">{s.label}</th>) : <th className="num">People working</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.x}>
              <td>{r.x === 0 ? 'Start' : `End of ${calendarYear(r.x / QUARTERS_PER_YEAR)}`}</td>
              {view === 'share' ? (
                SHARE_SERIES.map((s) => (
                  <td key={s.key} className="num">
                    {r[s.key].toFixed(1)}%
                  </td>
                ))
              ) : (
                <td className="num">{r.jobs.toFixed(2)}M</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
