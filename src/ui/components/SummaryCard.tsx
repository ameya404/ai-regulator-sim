import { useMemo } from 'react';
import type { SimConfig, WorldState } from '../../sim';
import { calendarYear, yearSlices } from '../game';
import { summarizeYear } from '../summary';

/** The centerpiece: what happened in the year that just ended, in plain English. */
export function SummaryCard({ history, config }: { history: readonly WorldState[]; config: SimConfig }) {
  const years = useMemo(() => yearSlices(history), [history]);
  const last = years[years.length - 1];
  const sentences = useMemo(() => (last ? summarizeYear(last, years[years.length - 2], config) : []), [last, years, config]);

  return (
    <section className="summary" aria-live="polite" aria-labelledby="summary-title">
      <h2 id="summary-title" className="summary-title">
        {last ? `What happened in ${last.calendarYear}` : `Welcome, regulator`}
      </h2>
      {last ? (
        <div className="summary-body" key={last.year}>
          {sentences.map((s, i) => (
            <p key={i} style={{ animationDelay: `${i * 140}ms` }}>
              {s}
            </p>
          ))}
        </div>
      ) : (
        <div className="summary-body">
          <p>
            Pick your rules on the left, then press <strong>End year</strong> to see what happens in {calendarYear(1)}.
          </p>
        </div>
      )}
    </section>
  );
}
