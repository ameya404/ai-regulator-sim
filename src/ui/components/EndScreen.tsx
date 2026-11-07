import { useEffect, useRef, useState } from 'react';
import { emptyPolicySet, type WorldState } from '../../sim';
import { compareOutcomes, hiddenReveal, insights } from '../derive';
import { playGame } from '../game';
import type { Game } from '../useSimulation';

interface Props {
  game: Game;
  onClose: () => void;
  onNewGame: () => void;
  /** Path A finished: keep it and replay the same world with different rules. */
  onReplayDifferent: () => void;
  /** Path B finished: go to the A vs B comparison. */
  onCompare?: () => void;
}

/** Final results vs a "do nothing" run from the same start, plus what was hidden. */
export function EndScreen({ game, onClose, onNewGame, onReplayDifferent, onCompare }: Props) {
  const [baseline, setBaseline] = useState<WorldState[] | null>(null);
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    // Same world and same luck as your game; only the rules differ.
    playGame(game.config, game.seed, emptyPolicySet(), game.history[0])
      .then((h) => alive && setBaseline(h))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [game]);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = baseline ? compareOutcomes(game.history, baseline) : [];
  const notes = baseline ? insights(game.history, baseline) : [];
  const hidden = hiddenReveal(game.history);

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div className="dialog end" role="dialog" aria-modal="true" aria-labelledby="end-title" tabIndex={-1} ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">{onCompare ? 'Path B · five years later' : 'Five years later'}</p>
        <h2 id="end-title">Your term is over</h2>
        <p className="lede">Your results, next to what would have happened if you had done nothing.</p>

        {failed && <p className="warn-note">Couldn't run the comparison.</p>}
        {!baseline && !failed && <p className="muted">Running the “do nothing” version…</p>}

        {baseline && (
          <div className="end-grid">
            <table className="data-table compare">
              <thead>
                <tr>
                  <th />
                  <th className="num">Your rules</th>
                  <th className="num">Do nothing</th>
                  <th className="num">Difference</th>
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
              <h3>What your rules did</h3>
              <ul>
                {notes.length === 0 && <li>Your rules barely changed the outcome.</li>}
                {notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <section className="unseen" aria-labelledby="unseen-title">
                <h3 id="unseen-title">What you didn't see</h3>
                <p className="unseen-note">This was hidden from you during the game.</p>
                <ul>
                  {hidden.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        )}


        <div className="dialog-actions">
          <button className="btn ghost" onClick={onClose}>
            Back to the chart
          </button>
          <button className="btn ghost" onClick={onNewGame}>
            New game
          </button>
          {onCompare ? (
            <button className="btn primary" onClick={onCompare}>
              Compare with Path A →
            </button>
          ) : (
            <button className="btn primary" onClick={onReplayDifferent} title="Same world, same luck: only your rules change">
              Replay with different rules →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
