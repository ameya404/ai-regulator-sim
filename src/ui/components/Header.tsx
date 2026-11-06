import { useRef } from 'react';
import { quarterLabel } from '../format';
import type { Simulation } from '../useSimulation';

interface Props {
  sim: Simulation;
  showHidden: boolean;
  onToggleHidden: () => void;
  onShowResults: () => void;
}

export function Header({ sim, showHidden, onToggleHidden, onShowResults }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { current, game, isOver } = sim;
  const total = game.config.turns;

  const download = () => {
    const blob = new Blob([sim.exportGame()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unintended-consequences-seed${game.seed}-turn${current.turn}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) sim.importGame(await file.text());
  };

  const newGame = () => {
    if (current.turn === 0 || window.confirm('Start a new game? Your current game will be replaced (export it first to keep it).')) {
      sim.restart();
    }
  };

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <h1>Unintended Consequences</h1>
          <p className="subtitle">Office of AI Regulation · Situation Room</p>
        </div>
      </div>

      <div className="clock" aria-live="polite">
        <span className="clock-label">{isOver ? 'Term complete' : current.turn === 0 ? 'Before your first quarter' : 'Quarter just ended'}</span>
        <span className="clock-value">{quarterLabel(current.turn)}</span>
        <div className="clock-track" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={current.turn} aria-label="Quarters played">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < current.turn ? 'tick done' : 'tick'} />
          ))}
        </div>
      </div>

      <div className="header-actions">
        <label className="switch">
          <input type="checkbox" checked={showHidden} onChange={onToggleHidden} />
          <span className="switch-ui" aria-hidden="true" />
          <span>Show hidden</span>
        </label>
        {isOver && (
          <button className="btn" onClick={onShowResults}>
            Results
          </button>
        )}
        <button className="btn ghost" onClick={newGame}>
          New game
        </button>
        <button className="btn ghost" onClick={download}>
          Export
        </button>
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
      </div>
    </header>
  );
}
