import { ACTOR_IDS, ACTORS, moveDefinition, type ActorId, type WorldState } from '../../sim';
import { LOOPHOLE_MOVES, money } from '../format';
import { useTween } from '../useTween';

const MONEY_LABEL: Record<ActorId, string> = {
  bigLab: 'Cash',
  startup: 'Cash',
  employer: 'Cash',
  labor: 'Strike fund',
  public: 'Program budget',
};

/** Shorter display names where the full one won't fit a card. */
const CARD_NAME: Partial<Record<ActorId, string>> = { public: 'Congress' };

function ActorCard({ id, state, previous, showHidden }: { id: ActorId; state: WorldState; previous?: WorldState; showHidden: boolean }) {
  const a = state.actors[id];
  const def = ACTORS[id];
  const m = useTween(a.money);
  const delta = previous ? a.money - previous.actors[id].money : undefined;
  const caughtThisTurn = state.log.some((e) => e.turn === state.turn && e.kind === 'loopholeCaught' && e.actor === id);
  const moves = a.lastMoves.filter((mv) => showHidden || !LOOPHOLE_MOVES.includes(mv) || caughtThisTurn);
  const share = id === 'bigLab' || id === 'startup' ? state.world.marketShare[id] : undefined;
  const status = a.status === 'active' ? null : a.status === 'acquired' ? 'Acquired' : 'Shut down';

  const moveLabels = moves.map((mv) => moveDefinition(id, mv)?.label ?? mv);
  const hasLoophole = moves.some((mv) => LOOPHOLE_MOVES.includes(mv));
  let movesText = moveLabels.join(', ');
  if (state.turn === 0) movesText = 'Waiting for Q1';
  else if (status) movesText = 'Out of the game';
  else if (!movesText) movesText = 'No visible moves';

  return (
    <article className={`actor${status ? ' gone' : ''}`}>
      <header>
        <h3 title={`${def.name}: ${def.description}`}>{CARD_NAME[id] ?? def.name}</h3>
      </header>
      <div className="actor-money-value" title={MONEY_LABEL[id]}>
        {status ? <span className="tag tag-critical">■ {status.toUpperCase()}</span> : money(m, Math.abs(a.money) < 10 ? 2 : 1)}
      </div>
      <div className="actor-meta">
        {delta !== undefined && !status && Math.abs(delta) > 0.005 && (
          <span className="actor-delta">
            <span aria-hidden="true">{delta > 0 ? '▲' : '▼'}</span>
            <span className="sr-only">{delta > 0 ? 'up' : 'down'}</span> {money(Math.abs(delta), 2)}
          </span>
        )}
        <span>{share !== undefined && !status ? `${(share * 100).toFixed(1)}% share` : MONEY_LABEL[id].toLowerCase()}</span>
      </div>
      <p className={`actor-moves${hasLoophole ? ' loophole' : ''}`} title={movesText}>
        <span className="sr-only">Last moves: </span>
        {movesText}
      </p>
    </article>
  );
}

export function ActorStrip({ current, previous, showHidden }: { current: WorldState; previous?: WorldState; showHidden: boolean }) {
  return (
    <section className="actors" aria-label="Actors">
      {ACTOR_IDS.map((id) => (
        <ActorCard key={id} id={id} state={current} previous={previous} showHidden={showHidden} />
      ))}
    </section>
  );
}
