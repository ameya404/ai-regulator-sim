import { EXEMPTABLE_POLICIES, POLICY_IDS, type PolicyId } from '../../sim';
import { previewPolicyCosts, strengthGap } from '../derive';
import { POLICY_HELP, POLICY_LABELS } from '../format';
import type { Simulation } from '../useSimulation';

interface Props {
  sim: Simulation;
  showHidden: boolean;
}

export function PolicyPanel({ sim, showHidden }: Props) {
  const { current, pending, game, busy, isOver } = sim;
  const preview = previewPolicyCosts(current, pending, game.config);
  const gap = strengthGap(current);
  const afterChanges = preview.remaining;

  return (
    <section className="panel policy-panel" aria-labelledby="policy-title">
      <div className="panel-head">
        <h2 id="policy-title">Your policies</h2>
        <span className="panel-note">Apply when the quarter ends</span>
      </div>

      <ul className="policy-list">
        {POLICY_IDS.map((id) => (
          <PolicyRow
            key={id}
            id={id}
            sim={sim}
            showHidden={showHidden}
            cost={preview.rows[id].cost}
            changed={preview.rows[id].changed}
            affordable={preview.rows[id].affordable}
            effective={gap[id].effective}
          />
        ))}
      </ul>

      <div className="policy-footer">
        <div className="capital-summary">
          <div className="capital-line">
            <span>Political capital</span>
            <span>
              <strong>{preview.available.toFixed(0)}</strong>
              {preview.totalCost > 0 && (
                <>
                  {' '}
                  <span className={preview.anyRejected ? 'text-warning' : 'muted'}>− {preview.totalCost.toFixed(0)}</span> → <strong>{afterChanges.toFixed(0)}</strong>
                </>
              )}
            </span>
          </div>
          <div className="capital-bar" aria-hidden="true">
            <span className="cap-left" style={{ width: `${Math.max(0, afterChanges)}%` }} />
            <span className="cap-spend" style={{ width: `${Math.max(0, preview.available - afterChanges)}%` }} />
          </div>
          {preview.anyRejected && (
            <p className="warn-note" role="status">
              <span aria-hidden="true">⚠</span> Not enough capital for everything. Changes marked “Can’t afford” will be rejected.
            </p>
          )}
        </div>
        <div className="footer-buttons">
          <button className="btn ghost" onClick={sim.resetPending} disabled={!sim.hasPendingChanges || busy}>
            Reset
          </button>
          <button className="btn primary big" onClick={() => void sim.endQuarter()} disabled={busy || isOver}>
            {isOver ? 'Term complete' : busy ? 'Simulating…' : 'End quarter →'}
          </button>
        </div>
      </div>
    </section>
  );
}

interface RowProps {
  id: PolicyId;
  sim: Simulation;
  showHidden: boolean;
  cost: number;
  changed: boolean;
  affordable: boolean;
  effective: number;
}

function PolicyRow({ id, sim, showHidden, cost, changed, affordable, effective }: RowProps) {
  const pending = sim.pending[id];
  const enacted = sim.current.policies[id];
  const exemptable = EXEMPTABLE_POLICIES.includes(id);
  const disabled = sim.busy || sim.isOver;
  const pct = Math.round(pending.strength * 100);
  const lobbied = enacted.strength - effective > 0.005;
  const inputId = `policy-${id}`;

  return (
    <li className={`policy-row${changed ? ' changed' : ''}${changed && !affordable ? ' unaffordable' : ''}`}>
      <div className="policy-top">
        <label htmlFor={inputId} className="policy-name" title={POLICY_HELP[id]}>
          {POLICY_LABELS[id]}
        </label>
        {changed && (
          <span className={`cost-chip${affordable ? '' : ' bad'}`} title={affordable ? 'Political capital this change costs' : 'Not enough political capital: this change will be rejected'}>
            {affordable ? `−${cost.toFixed(0)}` : `⚠ Can’t afford ${cost.toFixed(0)}`}
          </span>
        )}
        <span className="policy-value">{pct === 0 ? 'Off' : `${pct}%`}</span>
      </div>

      <div className="policy-controls">
        <div className="slider-wrap">
          <input
            id={inputId}
            type="range"
            min={0}
            max={100}
            step={5}
            value={pct}
            disabled={disabled}
            onChange={(e) => sim.setPolicy(id, { strength: Number(e.target.value) / 100 })}
            style={{ '--fill': `${pct}%` } as React.CSSProperties}
            aria-valuetext={`${pct}%`}
          />
          {changed && <span className="enacted-tick" style={{ left: `${enacted.strength * 100}%` }} title={`Currently enacted: ${Math.round(enacted.strength * 100)}%`} />}
        </div>
        {exemptable && (
          <label className={`exempt-chip${pending.smallCompanyExemption ? ' on' : ''}`} title="Firms under the small-company revenue threshold don't have to comply">
            <input
              type="checkbox"
              checked={pending.smallCompanyExemption}
              disabled={disabled}
              onChange={(e) => sim.setPolicy(id, { smallCompanyExemption: e.target.checked })}
            />
            <span>Exempt small</span>
          </label>
        )}
      </div>

      {showHidden && enacted.strength > 0 && (
        <div className={`effective${lobbied ? ' lobbied' : ''}`}>
          <div className="effective-bars" aria-hidden="true">
            <span className="eff-set" style={{ width: `${enacted.strength * 100}%` }} />
            <span className="eff-real" style={{ width: `${effective * 100}%` }} />
          </div>
          <span className="effective-text">
            <span className="hidden-tag">HIDDEN</span> Set <strong>{Math.round(enacted.strength * 100)}%</strong> · Effective{' '}
            <strong className="eff-num">{Math.round(effective * 100)}%</strong>
            {lobbied && <> · lobbied −{Math.round((enacted.strength - effective) * 100)} pts</>}
          </span>
        </div>
      )}
    </li>
  );
}
