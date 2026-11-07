import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compareQuarterRows, compareTable, compareYearRows, pathLabel, verdict } from '../compare';
import { quarterLabel } from '../format';
import { calendarYear, QUARTERS_PER_YEAR } from '../game';
import { AXIS, GRID, INK_2, MUTED, SERIES, SURFACE } from '../theme';
import type { Game } from '../useSimulation';

const reducedMotion = (() => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
})();
const ANIM = { isAnimationActive: !reducedMotion, animationDuration: 900, animationEasing: 'ease-out' as const };

const COLOR_A = SERIES[0];
const COLOR_B = SERIES[1];
const DASH = '9 6';

type View = 'share' | 'jobs' | 'incidents';
const VIEWS: { id: View; label: string; subtitle: string }[] = [
  { id: 'share', label: "Big AI company's market share", subtitle: 'Share of all AI sales, %' },
  { id: 'jobs', label: 'Jobs', subtitle: 'Million people working' },
  { id: 'incidents', label: 'AI safety incidents', subtitle: 'Incidents per year' },
];

interface Props {
  a: Game;
  b: Game;
  onClose: () => void;
  onSeeB: () => void;
  onTryAnother: () => void;
  onNewGame: () => void;
}

/** Path A vs Path B, shown when Path B ends (or when a saved comparison is loaded). */
export function ComparisonScreen({ a, b, onClose, onSeeB, onTryAnother, onNewGame }: Props) {
  const [view, setView] = useState<View>('share');
  const dialogRef = useRef<HTMLDivElement>(null);
  const labelA = useMemo(() => pathLabel(a.history), [a.history]);
  const labelB = useMemo(() => pathLabel(b.history), [b.history]);
  const [s1, s2] = useMemo(() => verdict(a.history, b.history), [a.history, b.history]);
  const rows = useMemo(() => compareTable(a.history, b.history), [a.history, b.history]);
  const quarters = useMemo(() => compareQuarterRows(a.history, b.history), [a.history, b.history]);
  const years = useMemo(() => compareYearRows(a.history, b.history), [a.history, b.history]);
  const meta = VIEWS.find((v) => v.id === view)!;

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const total = a.config.turns;
  const yearCount = Math.ceil(total / QUARTERS_PER_YEAR);
  const yearTicks = Array.from({ length: yearCount }, (_, i) => (i + 0.5) * QUARTERS_PER_YEAR);
  const boundaries = Array.from({ length: yearCount - 1 }, (_, i) => (i + 1) * QUARTERS_PER_YEAR);
  const margin = { top: 12, right: 20, bottom: 4, left: 4 };
  const xAxis = (
    <XAxis
      dataKey="x"
      type="number"
      domain={[0, total]}
      ticks={yearTicks}
      tickFormatter={(x: number) => String(calendarYear(Math.floor(x / QUARTERS_PER_YEAR) + 1))}
      stroke={AXIS}
      tick={{ fill: MUTED, fontSize: 15, fontWeight: 600 }}
      tickLine={false}
    />
  );
  const grid = (
    <>
      <CartesianGrid vertical={false} stroke={GRID} />
      {boundaries.map((x) => (
        <ReferenceLine key={x} x={x} stroke={GRID} />
      ))}
    </>
  );
  const tip = (fmt: (v: number) => string, title: (x: number) => string) => (
    <Tooltip
      isAnimationActive={false}
      cursor={view === 'incidents' ? { fill: 'rgba(255,255,255,0.05)' } : { stroke: INK_2, strokeWidth: 1 }}
      content={(p) => {
        const { active, label, payload } = p as unknown as { active?: boolean; label?: number; payload?: readonly { dataKey?: string; value?: number }[] };
        if (!active || !payload?.length) return null;
        const val = (k: string) => payload.find((x) => String(x.dataKey).endsWith(k))?.value;
        const va = val(view === 'incidents' ? 'a' : 'A');
        const vb = val(view === 'incidents' ? 'b' : 'B');
        return (
          <div className="chart-tooltip">
            <div className="tt-title">{title(Number(label))}</div>
            {va !== undefined && (
              <div className="tt-row">
                <span className="line-key solid" style={{ borderColor: COLOR_A }} />
                <span>Path A</span>
                <span className="tt-val">{fmt(va)}</span>
              </div>
            )}
            {vb !== undefined && (
              <div className="tt-row">
                <span className="line-key dashed" style={{ borderColor: COLOR_B }} />
                <span>Path B</span>
                <span className="tt-val">{fmt(vb)}</span>
              </div>
            )}
          </div>
        );
      }}
    />
  );
  const yAxis = (fmt: (v: number) => string, domain: [number | string, number | string], ticks?: number[]) => (
    <YAxis domain={domain as never} ticks={ticks} tickFormatter={fmt} stroke={AXIS} tick={{ fill: MUTED, fontSize: 15 }} tickLine={false} axisLine={false} width={60} />
  );
  const line = (key: string, color: string, dashed: boolean, name: string) => (
    <Line
      type="monotone"
      dataKey={key}
      name={name}
      stroke={color}
      strokeWidth={4}
      strokeDasharray={dashed ? DASH : undefined}
      dot={false}
      activeDot={{ r: 7, stroke: SURFACE, strokeWidth: 2 }}
      connectNulls={false}
      {...ANIM}
    />
  );

  let chart: React.ReactElement;
  if (view === 'share') {
    chart = (
      <LineChart data={quarters} margin={margin}>
        {grid}
        {xAxis}
        {yAxis((v) => `${v}%`, [0, 100], [0, 25, 50, 75, 100])}
        {tip((v) => `${v.toFixed(1)}%`, quarterLabel)}
        {line('shareA', COLOR_A, false, 'Path A')}
        {line('shareB', COLOR_B, true, 'Path B')}
      </LineChart>
    );
  } else if (view === 'jobs') {
    chart = (
      <LineChart data={quarters} margin={margin}>
        {grid}
        {xAxis}
        {yAxis((v) => `${v.toFixed(0)}M`, ['dataMin - 1', 'dataMax + 1'])}
        {tip((v) => `${v.toFixed(2)}M`, quarterLabel)}
        {line('jobsA', COLOR_A, false, 'Path A')}
        {line('jobsB', COLOR_B, true, 'Path B')}
      </LineChart>
    );
  } else {
    chart = (
      <BarChart data={years} margin={margin} barGap={6}>
        {grid}
        {xAxis}
        {yAxis((v) => v.toFixed(0), [0, 'auto'])}
        {tip((v) => v.toFixed(0), (x) => String(calendarYear(Math.floor(x / QUARTERS_PER_YEAR) + 1)))}
        <Bar dataKey="a" name="Path A" fill={COLOR_A} radius={[4, 4, 0, 0]} barSize={40} {...ANIM} />
        <Bar dataKey="b" name="Path B" fill={SURFACE} stroke={COLOR_B} strokeWidth={3} strokeDasharray="6 4" radius={[4, 4, 0, 0]} barSize={40} {...ANIM} />
      </BarChart>
    );
  }

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div className="dialog compare-dialog" role="dialog" aria-modal="true" aria-labelledby="cmp-title" tabIndex={-1} ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow" id="cmp-title">
          Path A vs Path B · same world, different rules
        </p>
        <ul className="paths">
          <li>
            <span className="line-key solid" style={{ borderColor: COLOR_A }} aria-hidden="true" />
            <strong>A:</strong> {labelA}
          </li>
          <li>
            <span className="line-key dashed" style={{ borderColor: COLOR_B }} aria-hidden="true" />
            <strong>B:</strong> {labelB}
          </li>
        </ul>

        <div className="verdict" aria-live="polite">
          <p>{s1}</p>
          <p>{s2}</p>
        </div>

        <div className="compare-grid">
          <section className="compare-chart" aria-label="Chart comparing both paths">
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
            </div>
            <div className="compare-chart-body">
              <ResponsiveContainer width="100%" height="100%">
                {chart}
              </ResponsiveContainer>
            </div>
          </section>

          <table className="data-table compare-table">
            <thead>
              <tr>
                <th />
                <th className="num">Path A</th>
                <th className="num">Path B</th>
                <th className="num">B vs A</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  <td className="num">{r.a}</td>
                  <td className="num">{r.b}</td>
                  <td className={`num verdict-${r.verdict}`}>
                    {r.verdict !== 0 && <span aria-hidden="true">{r.verdict > 0 ? '✓ ' : '✗ '}</span>}
                    {r.diff}
                    {r.verdict !== 0 && <span className="sr-only">{r.verdict > 0 ? ' (B better)' : ' (B worse)'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="dialog-actions">
          <button className="btn ghost" onClick={onClose}>
            Back to the chart
          </button>
          <button className="btn ghost" onClick={onSeeB}>
            Path B's full results
          </button>
          <button className="btn ghost" onClick={onNewGame}>
            New game
          </button>
          <button className="btn primary" onClick={onTryAnother}>
            Try another Path B
          </button>
        </div>
      </div>
    </div>
  );
}
