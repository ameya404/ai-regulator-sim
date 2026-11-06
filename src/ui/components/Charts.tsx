import { useEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartRow, PolicyDelta, PolicyMarker } from '../derive';
import { POLICY_LABELS, POLICY_SHORT, quarterLabel, shortQuarter } from '../format';
import { AXIS, GRID, INK_2, MARKER, MUTED, SERIES, SURFACE } from '../theme';

export interface SeriesDef {
  key: keyof ChartRow;
  label: string;
  color: string;
}

type Kind = 'line' | 'stackedArea' | 'bar';

interface ChartSpec {
  title: string;
  subtitle: string;
  kind: Kind;
  series: SeriesDef[];
  format: (v: number) => string;
  yDomain?: [number | 'auto' | 'dataMin' | 'dataMax', number | 'auto' | 'dataMin' | 'dataMax'];
  yTicks?: number[];
}

const reducedMotion = (() => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
})();
const ANIM = { isAnimationActive: !reducedMotion, animationDuration: 700, animationEasing: 'ease-out' as const };

const SECTOR_SERIES = (prefix: '' | 'wage_'): SeriesDef[] => [
  { key: `${prefix}manufacturing` as keyof ChartRow, label: 'Manufacturing', color: SERIES[0] },
  { key: `${prefix}services` as keyof ChartRow, label: 'Services', color: SERIES[1] },
  { key: `${prefix}knowledge` as keyof ChartRow, label: 'Knowledge work', color: SERIES[2] },
  { key: `${prefix}healthcare` as keyof ChartRow, label: 'Healthcare', color: SERIES[3] },
];

const index = (v: number) => v.toFixed(1);

export const TABS: { id: string; label: string; charts: ChartSpec[] }[] = [
  {
    id: 'market',
    label: 'Market',
    charts: [
      {
        title: 'AI market share',
        subtitle: 'Share of AI model revenue, %',
        kind: 'stackedArea',
        series: [
          { key: 'bigLab', label: 'Frontier Lab', color: SERIES[0] },
          { key: 'startup', label: 'Upstart AI', color: SERIES[1] },
          { key: 'other', label: 'Other firms', color: SERIES[2] },
        ],
        format: (v) => `${v.toFixed(1)}%`,
        yDomain: [0, 100],
        yTicks: [0, 25, 50, 75, 100],
      },
    ],
  },
  {
    id: 'jobs',
    label: 'Jobs',
    charts: [
      {
        title: 'Jobs by sector',
        subtitle: 'Employment index, start = 100',
        kind: 'line',
        series: SECTOR_SERIES(''),
        format: index,
        yDomain: ['auto', 'auto'],
      },
      {
        title: 'Displaced workers',
        subtitle: 'Millions without a job in the 4 sectors',
        kind: 'line',
        series: [{ key: 'displaced', label: 'Displaced', color: SERIES[0] }],
        format: (v) => `${v.toFixed(2)}M`,
        yDomain: [0, 'auto'],
      },
    ],
  },
  {
    id: 'wages',
    label: 'Wages',
    charts: [
      {
        title: 'Wages by sector',
        subtitle: 'Wage index, start = 100',
        kind: 'line',
        series: SECTOR_SERIES('wage_'),
        format: index,
        yDomain: ['auto', 'auto'],
      },
    ],
  },
  {
    id: 'safety',
    label: 'AI & safety',
    charts: [
      {
        title: 'AI capability',
        subtitle: 'Frontier capability, 1.00× = start',
        kind: 'line',
        series: [{ key: 'capability', label: 'Capability', color: SERIES[0] }],
        format: (v) => `${v.toFixed(2)}×`,
        yDomain: [1, 'auto'],
      },
      {
        title: 'Safety incidents',
        subtitle: 'Incidents per quarter',
        kind: 'bar',
        series: [{ key: 'incidents', label: 'Incidents', color: SERIES[0] }],
        format: (v) => v.toFixed(0),
        yDomain: [0, 'auto'],
      },
    ],
  },
  {
    id: 'politics',
    label: 'Trust & capital',
    charts: [
      {
        title: 'Public trust and political capital',
        subtitle: 'Both on a 0–100 scale',
        kind: 'line',
        series: [
          { key: 'trust', label: 'Public trust (%)', color: SERIES[0] },
          { key: 'capital', label: 'Political capital', color: SERIES[1] },
        ],
        format: (v) => v.toFixed(0),
        yDomain: [0, 100],
        yTicks: [0, 25, 50, 75, 100],
      },
    ],
  },
];

// ---------------------------------------------------------------------------

function changeText(c: PolicyDelta): string {
  if (c.from === c.to && c.exemptionChanged) return `${POLICY_SHORT[c.policy]} ${c.exemption ? '+EXEMPT' : '−EXEMPT'}`;
  return `${POLICY_SHORT[c.policy]} ${c.to > c.from ? '▲' : '▼'}`;
}

export function describeChange(c: PolicyDelta): string {
  const parts: string[] = [];
  if (c.from !== c.to) parts.push(`${Math.round(c.from * 100)}% → ${Math.round(c.to * 100)}%`);
  if (c.exemptionChanged) parts.push(c.exemption ? 'small firms exempted' : 'exemption removed');
  return `${POLICY_LABELS[c.policy]}: ${parts.join(', ')}`;
}

/** The label drawn at the top of a policy-change marker. Two tiers so neighbours don't collide. */
function MarkerLabel(props: { viewBox?: { x: number; y: number }; marker: PolicyMarker; tier: number }) {
  const { viewBox, marker, tier } = props;
  if (!viewBox) return null;
  const text = marker.changes.length > 1 ? `${marker.changes.length} POLICIES` : changeText(marker.changes[0]);
  const y = viewBox.y - 30 + tier * 18;
  const width = text.length * 8.4 + 14;
  return (
    <g className="marker-label">
      <rect x={viewBox.x - width / 2} y={y - 13} width={width} height={20} rx={4} fill={SURFACE} stroke={MARKER} strokeOpacity={0.55} />
      <text x={viewBox.x} y={y + 2} textAnchor="middle" fill={MARKER} fontSize={13} fontWeight={700} letterSpacing={0.4}>
        {text}
      </text>
    </g>
  );
}

interface TooltipPayload {
  dataKey?: string | number;
  value?: number | string;
  color?: string;
}

function ChartTooltip(props: { active?: boolean; label?: number | string; payload?: readonly TooltipPayload[]; spec: ChartSpec; markers: PolicyMarker[] }) {
  const { active, label, payload, spec, markers } = props;
  if (!active || !payload?.length) return null;
  const turn = Number(label);
  const marker = markers.find((m) => m.turn === turn);
  return (
    <div className="chart-tooltip">
      <div className="tt-title">{quarterLabel(turn)}</div>
      {spec.series
        .slice()
        .reverse()
        .map((s) => {
          const p = payload.find((x) => x.dataKey === s.key);
          if (!p) return null;
          return (
            <div key={String(s.key)} className="tt-row">
              <span className="swatch" style={{ background: s.color }} />
              <span className="tt-name">{s.label}</span>
              <span className="tt-val">{spec.format(Number(p.value))}</span>
            </div>
          );
        })}
      {marker && (
        <div className="tt-policies">
          <div className="tt-sub">Policy changes this quarter</div>
          {marker.changes.map((c) => (
            <div key={c.policy}>◆ {describeChange(c)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function EndLabel(props: { x?: number; y?: number; index?: number; value?: number; lastIndex: number; text: string }) {
  const { x, y, index: i, lastIndex, text } = props;
  if (i !== lastIndex || x === undefined || y === undefined || lastIndex < 1) return null;
  return (
    <text x={x + 10} y={y + 5} fill={INK_2} fontSize={15} fontWeight={600}>
      {text}
    </text>
  );
}

interface ChartProps {
  spec: ChartSpec;
  rows: ChartRow[];
  markers: PolicyMarker[];
  turns: number;
}

export function TimeSeriesChart({ spec, rows, markers, turns }: ChartProps) {
  const [table, setTable] = useState(false);
  const lastIndex = rows.length - 1;
  const directLabels = spec.kind === 'line' && spec.series.length >= 2 && spec.series.length <= 4;
  const margin = { top: 44, right: directLabels ? 150 : 28, bottom: 8, left: 8 };
  const ticks = Array.from({ length: Math.floor(turns / 4) + 1 }, (_, i) => i * 4);

  const common = (
    <>
      <CartesianGrid vertical={false} stroke={GRID} />
      <XAxis
        dataKey="turn"
        type="number"
        domain={[0, turns]}
        ticks={ticks}
        tickFormatter={shortQuarter}
        stroke={AXIS}
        tick={{ fill: MUTED, fontSize: 15 }}
        tickLine={false}
        allowDecimals={false}
        padding={{ left: spec.kind === 'bar' ? 14 : 0, right: spec.kind === 'bar' ? 14 : 0 }}
      />
      <YAxis
        domain={spec.yDomain ?? ['auto', 'auto']}
        ticks={spec.yTicks}
        tickFormatter={(v: number) => spec.format(v)}
        stroke={AXIS}
        tick={{ fill: MUTED, fontSize: 15 }}
        tickLine={false}
        axisLine={false}
        width={72}
        allowDataOverflow={false}
      />
      <Tooltip
        content={(p) => <ChartTooltip {...(p as object)} spec={spec} markers={markers} />}
        cursor={spec.kind === 'bar' ? { fill: 'rgba(255,255,255,0.06)' } : { stroke: INK_2, strokeWidth: 1 }}
        isAnimationActive={false}
      />
      {markers.map((m, i) => (
        <ReferenceLine
          key={m.turn}
          x={m.turn}
          stroke={MARKER}
          strokeWidth={2}
          strokeOpacity={0.7}
          ifOverflow="extendDomain"
          label={<MarkerLabel marker={m} tier={i % 2} />}
        />
      ))}
    </>
  );

  let chart: React.ReactElement;
  if (spec.kind === 'stackedArea') {
    chart = (
      <AreaChart data={rows} margin={margin}>
        {common}
        {spec.series.map((s) => (
          <Area key={String(s.key)} type="monotone" dataKey={s.key} name={s.label} stackId="1" stroke={SURFACE} strokeWidth={2} fill={s.color} fillOpacity={0.92} {...ANIM} />
        ))}
      </AreaChart>
    );
  } else if (spec.kind === 'bar') {
    chart = (
      <BarChart data={rows} margin={margin} barCategoryGap={4}>
        {common}
        {spec.series.map((s) => (
          <Bar key={String(s.key)} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} {...ANIM} />
        ))}
      </BarChart>
    );
  } else {
    chart = (
      <LineChart data={rows} margin={margin}>
        {common}
        {spec.series.map((s) => (
          <Line
            key={String(s.key)}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 7, stroke: SURFACE, strokeWidth: 2 }}
            label={directLabels ? (p: object) => <EndLabel {...p} lastIndex={lastIndex} text={s.label} /> : undefined}
            {...ANIM}
          />
        ))}
      </LineChart>
    );
  }

  return (
    <figure className="chart-card">
      <figcaption className="chart-head">
        <div className="chart-title">
          <h3>{spec.title}</h3>
          <p>{spec.subtitle}</p>
        </div>
        <button className="btn tiny ghost" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? 'Chart' : 'Table'}
        </button>
        <ul className="legend" aria-label="Legend">
          {spec.series.length > 1 &&
            spec.series.map((s) => (
              <li key={String(s.key)}>
                <span className="swatch" style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
        </ul>
      </figcaption>
      {table ? (
        <DataTable spec={spec} rows={rows} markers={markers} />
      ) : (
        <div className="chart-body">
          <ResponsiveContainer width="100%" height="100%">
            {chart}
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

function DataTable({ spec, rows, markers }: { spec: ChartSpec; rows: ChartRow[]; markers: PolicyMarker[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Quarter</th>
            {spec.series.map((s) => (
              <th key={String(s.key)}>{s.label}</th>
            ))}
            <th>Policy changes</th>
          </tr>
        </thead>
        <tbody>
          {rows
            .slice()
            .reverse()
            .map((r) => (
              <tr key={r.turn}>
                <td>{quarterLabel(r.turn)}</td>
                {spec.series.map((s) => (
                  <td key={String(s.key)} className="num">
                    {spec.format(r[s.key] as number)}
                  </td>
                ))}
                <td className="policy-cell">
                  {markers
                    .find((m) => m.turn === r.turn)
                    ?.changes.map(describeChange)
                    .join('; ') ?? ''}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartPanel({ rows, markers, turns }: { rows: ChartRow[]; markers: PolicyMarker[]; turns: number }) {
  const [tab, setTab] = useState(TABS[0].id);
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  return (
    <section className="panel chart-panel" aria-label="Charts">
      <div className="tabs" role="tablist">
        {TABS.map((t, i) => (
          <button key={t.id} role="tab" aria-selected={t.id === tab} className={t.id === tab ? 'tab active' : 'tab'} onClick={() => setTab(t.id)} title={`Shortcut: ${i + 1}`}>
            {t.label}
          </button>
        ))}
        <span className="tabs-note">
          <span className="marker-key" aria-hidden="true" /> = quarter you changed policy
        </span>
      </div>
      <TabShortcuts onSelect={(i) => setTab(TABS[i].id)} />
      <div className={`charts n${active.charts.length}`}>
        {active.charts.map((spec) => (
          <TimeSeriesChart key={spec.title} spec={spec} rows={rows} markers={markers} turns={turns} />
        ))}
      </div>
    </section>
  );
}

/** Number keys 1–5 switch tabs (handy when presenting). Ignored while typing in a field. */
function TabShortcuts({ onSelect }: { onSelect: (i: number) => void }) {
  useKey((e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= TABS.length) onSelect(n - 1);
  });
  return null;
}

function useKey(handler: (e: KeyboardEvent) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = (e: KeyboardEvent) => ref.current(e);
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);
}
