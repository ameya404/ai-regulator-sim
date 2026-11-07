import { pathLabel } from '../compare';
import { calendarYear, totalYears, yearsPlayed } from '../game';
import type { Simulation } from '../useSimulation';
import { SettingsMenu } from './SettingsMenu';

interface Props {
  sim: Simulation;
  onDetails: () => void;
  onIntro: () => void;
  onResults: () => void;
  onCompare: () => void;
}

export function Header({ sim, onDetails, onIntro, onResults, onCompare }: Props) {
  const years = totalYears(sim.game.config);
  const played = yearsPlayed(sim.current);
  const nextYear = Math.min(played + 1, years);

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <h1>Unintended Consequences</h1>
          {sim.pathA ? (
            <p className="path-badge" title="Same world and luck as Path A; only your rules differ">
              <strong>Path B</strong> · comparing to A: {pathLabel(sim.pathA.history)}
            </p>
          ) : (
            <p className="subtitle">You are America's AI regulator</p>
          )}
        </div>
      </div>

      <div className="clock" aria-live="polite">
        <span className="clock-value">{sim.isOver ? 'Game over' : `Year ${nextYear} of ${years}`}</span>
        <span className="clock-sub">{sim.isOver ? `${calendarYear(1)}–${calendarYear(years)}` : `Next up: ${calendarYear(nextYear)}`}</span>
        <div className="year-dots" role="progressbar" aria-valuemin={0} aria-valuemax={years} aria-valuenow={played} aria-label="Years played">
          {Array.from({ length: years }, (_, i) => (
            <span key={i} className={i < played ? 'dot done' : i === played ? 'dot next' : 'dot'}>
              {calendarYear(i + 1)}
            </span>
          ))}
        </div>
      </div>

      <div className="header-actions">
        {sim.comparisonReady && (
          <button className="btn" onClick={onCompare}>
            A vs B
          </button>
        )}
        {sim.isOver && (
          <button className="btn" onClick={onResults}>
            Results
          </button>
        )}
        <button className="btn" onClick={onDetails}>
          Details
        </button>
        <SettingsMenu sim={sim} onIntro={onIntro} />
      </div>
    </header>
  );
}
