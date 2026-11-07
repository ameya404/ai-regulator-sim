import { useEffect, useRef, useState } from 'react';
import type { Simulation } from '../useSimulation';

/** Small ⚙ menu: new game, export/import a save, replay the intro. */
export function SettingsMenu({ sim, onIntro }: { sim: Simulation; onIntro: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const download = () => {
    const blob = new Blob([sim.exportGame()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unintended-consequences-${sim.game.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const newGame = () => {
    if (sim.current.turn === 0 || window.confirm('Start a new game? This one will be replaced.')) sim.restart();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) sim.importGame(await file.text());
  };

  return (
    <div className="menu" ref={rootRef}>
      <button className="btn icon" aria-label="Settings" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">⚙</span>
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <button role="menuitem" onClick={act(newGame)}>
            New game
          </button>
          <button role="menuitem" onClick={act(onIntro)}>
            How to play
          </button>
          <hr />
          <button role="menuitem" onClick={act(download)}>
            Save game to file
          </button>
          <button role="menuitem" onClick={act(() => fileRef.current?.click())}>
            Load game from file
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
    </div>
  );
}
