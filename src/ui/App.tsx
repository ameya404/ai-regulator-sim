import { useEffect, useMemo, useState } from 'react';
import { ActorStrip } from './components/ActorStrip';
import { ChartPanel } from './components/Charts';
import { EndScreen } from './components/EndScreen';
import { Header } from './components/Header';
import { KpiRow } from './components/KpiRow';
import { NewsFeed } from './components/NewsFeed';
import { PolicyPanel } from './components/PolicyPanel';
import { policyMarkers, toChartRows } from './derive';
import { useSimulation, type UseSimulationOptions } from './useSimulation';

const HIDDEN_KEY = 'unintended-consequences/show-hidden';

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function App(props: UseSimulationOptions = {}) {
  const sim = useSimulation(props);
  const [showHidden, setShowHidden] = useState(readHidden);
  const [resultsOpen, setResultsOpen] = useState(false);
  const { game, current, previous, isOver } = sim;

  useEffect(() => {
    try {
      window.localStorage.setItem(HIDDEN_KEY, showHidden ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }, [showHidden]);

  // Open the results automatically when the final quarter ends.
  useEffect(() => {
    if (isOver) setResultsOpen(true);
  }, [isOver, game.seed]);

  const rows = useMemo(() => toChartRows(game.history), [game.history]);
  const markers = useMemo(() => policyMarkers(game.history), [game.history]);

  return (
    <div className="app">
      <Header sim={sim} showHidden={showHidden} onToggleHidden={() => setShowHidden((h) => !h)} onShowResults={() => setResultsOpen(true)} />
      {sim.error && (
        <div className="error-bar" role="alert">
          <span>⚠ {sim.error}</span>
          <button className="btn tiny ghost" onClick={sim.clearError}>
            Dismiss
          </button>
        </div>
      )}
      <KpiRow current={current} previous={previous} />
      <main className="layout">
        <PolicyPanel sim={sim} showHidden={showHidden} />
        <div className="center">
          <ChartPanel rows={rows} markers={markers} turns={game.config.turns} />
          <ActorStrip current={current} previous={previous} showHidden={showHidden} />
        </div>
        <NewsFeed log={current.log} showHidden={showHidden} currentTurn={current.turn} />
      </main>
      {resultsOpen && isOver && (
        <EndScreen
          game={game}
          onClose={() => setResultsOpen(false)}
          onRestart={(same) => {
            setResultsOpen(false);
            sim.restart(same ? game.seed : undefined);
          }}
        />
      )}
    </div>
  );
}
