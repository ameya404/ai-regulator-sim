import { calendarYear, LEVEL_LABEL, LEVELS, levelOf, RULE_TEXT, RULE_WITH_EXEMPTION, RULES, totalYears, yearsPlayed, type RuleId } from '../game';
import type { Simulation } from '../useSimulation';

export function RulesPanel({ sim }: { sim: Simulation }) {
  const { busy, isOver } = sim;
  const nextYear = calendarYear(Math.min(yearsPlayed(sim.current) + 1, totalYears(sim.game.config)));

  return (
    <section className="panel rules-panel" aria-labelledby="rules-title">
      <div className="panel-head">
        <h2 id="rules-title">Your rules</h2>
        <p className="panel-note">They stay in place until you change them.</p>
      </div>

      <ul className="rule-list">
        {RULES.map((id) => (
          <RuleRow key={id} id={id} sim={sim} />
        ))}
      </ul>

      <div className="rules-footer">
        <button className="btn primary big" onClick={() => void sim.endYear()} disabled={busy || isOver}>
          {isOver ? 'Game over' : busy ? 'Simulating…' : `End year ${nextYear} →`}
        </button>
      </div>
    </section>
  );
}

function RuleRow({ id, sim }: { id: RuleId; sim: Simulation }) {
  const pending = sim.pending[id];
  const enacted = sim.current.policies[id];
  const level = levelOf(pending.strength);
  const changed = pending.strength !== enacted.strength || pending.smallCompanyExemption !== enacted.smallCompanyExemption;
  const disabled = sim.busy || sim.isOver;
  const text = RULE_TEXT[id];
  const groupId = `rule-${id}`;

  return (
    <li className={`rule${changed ? ' changed' : ''}`}>
      <div className="rule-top">
        <h3 id={groupId}>{text.name}</h3>
        {changed && <span className="changed-chip">New this year</span>}
      </div>
      <p className="rule-explain">{text.explain}</p>
      <div className="segmented" role="radiogroup" aria-labelledby={groupId}>
        {LEVELS.map((l) => (
          <button
            key={l}
            role="radio"
            aria-checked={level === l}
            className={`seg seg-${l}${level === l ? ' on' : ''}`}
            disabled={disabled}
            onClick={() => sim.setLevel(id, l)}
          >
            {LEVEL_LABEL[l]}
          </button>
        ))}
      </div>
      {id === RULE_WITH_EXEMPTION && (
        <label className={`skip${pending.strength === 0 ? ' inactive' : ''}`}>
          <input
            type="checkbox"
            checked={pending.smallCompanyExemption}
            disabled={disabled}
            onChange={(e) => sim.setPolicy(id, { smallCompanyExemption: e.target.checked })}
          />
          <span>Let small companies skip this</span>
        </label>
      )}
    </li>
  );
}
