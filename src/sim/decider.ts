/**
 * The pluggable decision-maker interface.
 *
 * The engine asks one `ActorDecider` per actor for its moves each quarter.
 * To swap the scripted rules for an AI (LLM) decider later, implement this
 * interface and pass it in the `deciders` map — nothing else changes.
 *
 * Rules a decider must follow (the engine enforces them):
 *   - Return at most `config.maxMovesPerActor` moves.
 *   - Only use moves from `context.definition.moves`.
 *   - Supply `target` for moves with `requiresTarget`.
 *   - Give every move a short `reason` (shown in the news feed).
 *   - Use `context.rng` for any randomness so runs stay reproducible.
 *     (An LLM decider is non-deterministic anyway; that's fine — the chosen
 *     moves are recorded in the log and the next saved state.)
 */
import type { ActorDefinition } from './actors/definitions';
import type { SimConfig } from './config';
import type { Rng } from './rng';
import type { ActorId, ActorState, ActorView, Move } from './types';

export interface DecisionContext {
  definition: ActorDefinition;
  config: SimConfig;
  rng: Rng;
}

/** A move without the actor id; the engine fills that in. */
export type ProposedMove = Omit<Move, 'actor'>;

/**
 * A decider may return just its moves, or moves plus updates to its private
 * memory (merged into `ActorState.memory`, saved with the state, and visible
 * to it next turn as `view.self.memory`). Values must be JSON-serializable.
 */
export type Decision = ProposedMove[] | { moves: ProposedMove[]; memory?: ActorState['memory'] };

export interface ActorDecider {
  /** Name for logs/debugging, e.g. "scripted" or "claude". */
  readonly name: string;
  decide(view: ActorView, context: DecisionContext): Decision | Promise<Decision>;
}

export type DeciderMap = Record<ActorId, ActorDecider>;
