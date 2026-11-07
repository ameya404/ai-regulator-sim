import { useCallback, useEffect, useMemo, useState } from 'react';
import { DetailsDrawer } from './components/DetailsDrawer';
import { EndScreen } from './components/EndScreen';
import { Header } from './components/Header';
import { IntroOverlay } from './components/IntroOverlay';
import { KpiRow } from './components/KpiRow';
import { MainChart } from './components/MainChart';
import { RulesPanel } from './components/RulesPanel';
import { SummaryCard } from './components/SummaryCard';
import { policyMarkers, toQuarterRows, toYearRows } from './derive';
import { useSimulation, type UseSimulationOptions } from './useSimulation';

const INTRO_KEY = 'unintended-consequences/intro-seen';

function introSeen(): boolean {
  try {
    return window.localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

export interface AppProps extends UseSimulationOptions {
  /** Force the intro on/off (tests). Defaults to "show on first visit". */
  showIntro?: boolean;
}

export function App({ showIntro, ...options }: AppProps = {}) {
  const sim = useSimulation(options);
  const { game, isOver } = sim;
  const [introOpen, setIntroOpen] = useState(() => showIntro ?? !introSeen());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);

  const closeIntro = useCallback(() => {
    setIntroOpen(false);
    try {
      window.localStorage.setItem(INTRO_KEY, '1');
    } catch {
      /* storage unavailable */
    }
  }, []);
  const closeDetails = useCallback(() => setDetailsOpen(false), []);
  const closeResults = useCallback(() => setResultsOpen(false), []);

  // Show results automatically when the last year ends.
  useEffect(() => {
    if (isOver) setResultsOpen(true);
  }, [isOver, game.seed]);

  const quarters = useMemo(() => toQuarterRows(game.history), [game.history]);
  const years = useMemo(() => toYearRows(game.history), [game.history]);
  const markers = useMemo(() => policyMarkers(game.history), [game.history]);

  return (
    <div className="app">
      <Header sim={sim} onDetails={() => setDetailsOpen(true)} onIntro={() => setIntroOpen(true)} onResults={() => setResultsOpen(true)} />
      {sim.error && (
        <div className="error-bar" role="alert">
          <span>⚠ {sim.error}</span>
          <button className="btn tiny ghost" onClick={sim.clearError}>
            Dismiss
          </button>
        </div>
      )}
      <KpiRow history={game.history} />
      <main className="layout">
        <RulesPanel sim={sim} />
        <div className="center">
          <SummaryCard history={game.history} config={game.config} />
          <MainChart quarters={quarters} years={years} markers={markers} totalQuarters={game.config.turns} />
        </div>
      </main>

      {detailsOpen && <DetailsDrawer history={game.history} onClose={closeDetails} />}
      {introOpen && <IntroOverlay config={game.config} onClose={closeIntro} />}
      {resultsOpen && isOver && !introOpen && (
        <EndScreen
          game={game}
          onClose={closeResults}
          onRestart={(same) => {
            setResultsOpen(false);
            sim.restart(same ? game.seed : undefined);
          }}
        />
      )}
    </div>
  );
}
