import { useCallback, useEffect, useMemo, useState } from 'react';
import { ComparisonScreen } from './components/ComparisonScreen';
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
  /** Which end-of-game dialog is open. */
  const [screen, setScreen] = useState<'none' | 'results' | 'compare'>('none');

  const closeIntro = useCallback(() => {
    setIntroOpen(false);
    try {
      window.localStorage.setItem(INTRO_KEY, '1');
    } catch {
      /* storage unavailable */
    }
  }, []);
  const closeDetails = useCallback(() => setDetailsOpen(false), []);
  const closeScreen = useCallback(() => setScreen('none'), []);
  const comparisonReady = sim.comparisonReady;

  // When the last year ends (or a finished game is loaded), open the comparison
  // if this was Path B, otherwise the normal results.
  useEffect(() => {
    if (isOver) setScreen(comparisonReady ? 'compare' : 'results');
    else setScreen('none');
  }, [isOver, comparisonReady, sim.gameKey]);

  const quarters = useMemo(() => toQuarterRows(game.history), [game.history]);
  const years = useMemo(() => toYearRows(game.history), [game.history]);
  const markers = useMemo(() => policyMarkers(game.history), [game.history]);

  return (
    <div className="app">
      <Header
        sim={sim}
        onDetails={() => setDetailsOpen(true)}
        onIntro={() => setIntroOpen(true)}
        onResults={() => setScreen('results')}
        onCompare={() => setScreen('compare')}
      />
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
      {screen === 'results' && isOver && !introOpen && (
        <EndScreen
          game={game}
          onClose={closeScreen}
          onNewGame={() => sim.restart()}
          onReplayDifferent={sim.replayWithDifferentRules}
          onCompare={comparisonReady ? () => setScreen('compare') : undefined}
        />
      )}
      {screen === 'compare' && comparisonReady && game.pathA && !introOpen && (
        <ComparisonScreen
          a={game.pathA}
          b={game}
          onClose={closeScreen}
          onSeeB={() => setScreen('results')}
          onTryAnother={sim.retryPathB}
          onNewGame={() => sim.restart()}
        />
      )}
    </div>
  );
}
