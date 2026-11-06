import { useEffect, useRef, useState } from 'react';
import { emptyPolicySet, runSimulation, type WorldState } from '../../sim';
import { compareOutcomes, insights } from '../derive';
import type { Game } from '../useSimulation';

/** Final results vs a "do nothing" run from the same starting state and seed. */
export function EndScreen({ game, onClose, onRestart }: { game: Game; onClose: () => void; onRestart: (sameSeed: boolean) => void }) {
  const [baseline, setBaseline] = useState<WorldState | null>(null);
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const final = game.history[game.history.length - 1];

  useEffect(() => {
    let alive = true;
    runSimulation({ config: game.config, initialState: game.history[0], policies: emptyPolicySet(), turns: final.turn })
      .then((h) => alive && setBaseline(h[h.length - 1]))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [game, final.turn]);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = baseline ? compareOutcomes(final, baseline) : [];
  const notes = baseline ? insights(final, baseline) : [];

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="end-title" tabIndex={-1} ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">Five years later</p>
        <h2 id="end-title">Your term is over</h2>
        <p className="lede">Here is your record, next to what would have happened if you had done nothing.</p>

        {failed && <p className="warn-note">Couldn't compute the comparison run.</p>}
        {!baseline && !failed && <p className="muted">Running the “do nothing” scenario…</p>}

        {baseline && (
          <div className="end-grid">
            <table className="data-table compare">
              <thead>
                <tr>
                  <th />
                  <th>Your policies</th>
                  <th>Do nothing</th>
                  <th>Difference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td className="num strong">{r.yours}</td>
                    <td className="num">{r.baseline}</td>
                    <td className={`num verdict-${r.verdict}`}>
                      {r.verdict !== 0 && <span aria-hidden="true">{r.verdict > 0 ? '✓ ' : '✗ '}</span>}
                      {r.diff}
                      {r.verdict !== 0 && <span className="sr-only">{r.verdict > 0 ? ' better' : ' worse'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="insights">
              <h3>Unintended consequences</h3>
              <ul>
                {notes.length === 0 && <li>Your policies barely changed the outcome.</li>}
                {notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="dialog-actions">
          <button className="btn ghost" onClick={onClose}>
            Back to charts
          </button>
          <button className="btn ghost" onClick={() => onRestart(true)}>
            Replay same seed
          </button>
          <button className="btn primary" onClick={() => onRestart(false)}>
            New game
          </button>
        </div>
      </div>
    </div>
  );
}
