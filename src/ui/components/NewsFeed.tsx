import { useMemo } from 'react';
import type { LogEntry } from '../../sim';
import { buildNews, quarterLabel, type NewsItem } from '../format';

const ICON: Record<NewsItem['tone'], string> = {
  critical: '■',
  serious: '▲',
  warning: '●',
  policy: '◆',
  good: '✓',
  neutral: '·',
};

export function NewsFeed({ log, showHidden, currentTurn }: { log: readonly LogEntry[]; showHidden: boolean; currentTurn: number }) {
  const items = useMemo(() => buildNews(log, showHidden), [log, showHidden]);
  const groups = useMemo(() => {
    const out: { turn: number; items: NewsItem[] }[] = [];
    for (const n of items) {
      const g = out[out.length - 1];
      if (g && g.turn === n.turn) g.items.push(n);
      else out.push({ turn: n.turn, items: [n] });
    }
    return out;
  }, [items]);

  return (
    <section className="panel news-panel" aria-labelledby="news-title">
      <div className="panel-head">
        <h2 id="news-title">Newswire</h2>
        {showHidden && <span className="hidden-tag">SHOWING HIDDEN</span>}
      </div>
      <div className="news-scroll" aria-live="polite">
        {groups.length === 0 && (
          <p className="empty">
            Nothing has happened yet. Set your policies and press <strong>End quarter</strong>.
          </p>
        )}
        {groups.map((g) => (
          <div key={g.turn} className={`news-group${g.turn === currentTurn ? ' latest' : ''}`}>
            <h3 className="news-quarter">{quarterLabel(g.turn)}</h3>
            <ul>
              {g.items.map((n) => (
                <li key={n.id} className={`news-item tone-${n.tone}${n.hidden ? ' is-hidden' : ''}`}>
                  <div className="news-tagline">
                    <span className={`tag tag-${n.tone}`}>
                      <span aria-hidden="true">{ICON[n.tone]}</span> {n.tag}
                    </span>
                    {n.hidden && <span className="hidden-tag">HIDDEN</span>}
                  </div>
                  <p className="headline">{n.headline}</p>
                  {n.reason && <p className="reason">“{n.reason}”</p>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
