import { useEffect, useMemo, useRef } from 'react';
import { ACTOR_IDS, type WorldState } from '../../sim';
import { calendarYearOfTurn } from '../game';
import { actorFullName, buildNews, money, type NewsItem } from '../format';

const MONEY_LABEL = { bigLab: 'cash', startup: 'cash', employer: 'cash', labor: 'strike fund', public: 'program budget' } as const;

/** Side panel with the companies and the full (cheating-free) news feed. */
export function DetailsDrawer({ history, onClose }: { history: readonly WorldState[]; onClose: () => void }) {
  const current = history[history.length - 1];
  const yearAgo = current.turn >= 4 ? history[current.turn - 4] : undefined;
  const panelRef = useRef<HTMLElement>(null);
  const news = useMemo(() => buildNews(current.log), [current.log]);
  const groups = useMemo(() => {
    const out: { year: number; items: NewsItem[] }[] = [];
    for (const n of news) {
      const y = calendarYearOfTurn(n.turn);
      const g = out[out.length - 1];
      if (g && g.year === y) g.items.push(n);
      else out.push({ year: y, items: [n] });
    }
    return out;
  }, [news]);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="details-title" tabIndex={-1} ref={panelRef} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2 id="details-title">Details</h2>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <h3 className="drawer-section">The players</h3>
        <ul className="companies">
          {ACTOR_IDS.map((id) => {
            const a = current.actors[id];
            const d = yearAgo ? a.money - yearAgo.actors[id].money : undefined;
            const gone = a.status !== 'active';
            return (
              <li key={id} className={`company${gone ? ' gone' : ''}`}>
                <span className="company-name">{actorFullName(id)}</span>
                <span className="company-money">
                  {gone ? (a.status === 'acquired' ? 'Bought out' : 'Shut down') : money(a.money, Math.abs(a.money) < 10 ? 2 : 1)}
                  {!gone && <small> {MONEY_LABEL[id]}</small>}
                </span>
                {!gone && d !== undefined && Math.abs(d) > 0.005 && (
                  <span className={`company-arrow ${d > 0 ? 'up' : 'down'}`} aria-label={d > 0 ? 'up from a year ago' : 'down from a year ago'}>
                    {d > 0 ? '▲' : '▼'}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <h3 className="drawer-section">All news</h3>
        {groups.length === 0 && <p className="muted">No news yet. Press End year to begin.</p>}
        {groups.map((g) => (
          <div key={g.year} className="news-group">
            <h4 className="news-year">{g.year}</h4>
            <ul>
              {g.items.map((n) => (
                <li key={n.id} className={`news-item tone-${n.tone}`}>
                  <p className="headline">{n.headline}</p>
                  {n.reason && <p className="reason">“{n.reason}”</p>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>
    </div>
  );
}
