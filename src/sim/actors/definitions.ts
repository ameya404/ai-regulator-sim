/**
 * Static descriptions of the five actors: who they are, what they want, and
 * the fixed list of moves each may choose from. Numbers for each move live in
 * config.ts (`moves` and `loopholes`); effects live in moves.ts.
 */
import { MOVE_IDS, type ActorId, type MoveId } from '../types';

export interface MoveDefinition {
  id: MoveId;
  label: string;
  description: string;
  /** Move must name a target policy. */
  requiresTarget: boolean;
  /** Loophole moves have a detection chance and penalties (config.loopholes). */
  isLoophole: boolean;
}

export interface ActorDefinition {
  id: ActorId;
  name: string;
  description: string;
  /** Plain-language goals, in priority order. Useful as a prompt for AI deciders later. */
  goals: string[];
  moves: MoveDefinition[];
}

const m = (
  id: MoveId,
  label: string,
  description: string,
  opts: Partial<Pick<MoveDefinition, 'requiresTarget' | 'isLoophole'>> = {},
): MoveDefinition => ({ id, label, description, requiresTarget: false, isLoophole: false, ...opts });

export const ACTORS: Record<ActorId, ActorDefinition> = {
  bigLab: {
    id: 'bigLab',
    name: 'Frontier Lab',
    description: 'A large, well-funded AI lab with most of the model market.',
    goals: ['Maximize market share', 'Stay profitable', 'Keep regulation light', 'Avoid scandals'],
    moves: [
      m('scaleCompute', 'Scale compute', 'Spend heavily on training to push capability and win share. Raises incident risk.'),
      m('investSafety', 'Invest in safety', 'Fund safety research; lowers incident risk for several quarters.'),
      m('cutPrices', 'Cut prices', 'Undercut competitors; gains share at the cost of revenue.'),
      m('lobby', 'Lobby', 'Quietly weaken the effective strength of a policy.', { requiresTarget: true, isLoophole: true }),
      m('safetyWashing', 'Safety-wash', 'Game safety tests instead of really complying.', { isLoophole: true }),
    ],
  },
  startup: {
    id: 'startup',
    name: 'Upstart AI',
    description: 'A small, fast-moving AI startup with thin cash reserves.',
    goals: ['Survive', 'Grow market share', 'Raise money', 'Build a reputation for openness'],
    moves: [
      m('shipFast', 'Ship fast', 'Release quickly to grab share. Raises incident risk.'),
      m('raiseFunding', 'Raise funding', 'Pitch investors; success depends on trust and traction.'),
      m('openRelease', 'Open release', 'Publish open models; small capability and trust boost.'),
      m('applyForSubsidy', 'Apply for subsidy', 'Claim the full startup/open-research subsidy.'),
      m('conserveCash', 'Conserve cash', 'Cut R&D to extend runway; lose momentum.'),
    ],
  },
  employer: {
    id: 'employer',
    name: 'MegaCorp',
    description: 'A large employer across all four sectors, deciding how to adopt AI.',
    goals: ['Maximize profit', 'Cut labor costs', 'Avoid strikes and fines'],
    moves: [
      m('automate', 'Automate', 'Replace workers with AI in exposed roles.'),
      m('augmentWorkers', 'Augment workers', 'Give workers AI tools; raises wages and productivity modestly.'),
      m('retrainWorkers', 'Retrain workers', 'Pay to move displaced workers into new roles.'),
      m('complianceTheater', 'Compliance theater', 'Pretend to do human review of AI decisions.', { isLoophole: true }),
      m('holdSteady', 'Hold steady', 'No change this quarter.'),
    ],
  },
  labor: {
    id: 'labor',
    name: 'Labor Coalition',
    description: 'Unions and worker groups representing employees in exposed sectors.',
    goals: ['Protect jobs', 'Raise wages', 'Win retraining support'],
    moves: [
      m('strike', 'Strike', 'Costly walkout; hits employer revenue and slows automation.'),
      m('campaign', 'Public campaign', 'Rally public support for regulation; gives the regulator capital.'),
      m('negotiate', 'Negotiate', 'Bargain for a modest wage increase.'),
      m('partnerRetraining', 'Partner on retraining', 'Make the retraining fund more effective.'),
      m('standBy', 'Stand by', 'Conserve the strike fund.'),
    ],
  },
  public: {
    id: 'public',
    name: 'Public & Congress',
    description: 'Voters and their representatives; control the regulator\'s mandate and program budget.',
    goals: ['Safety', 'Jobs', 'Economic growth', 'Hold powerful actors accountable'],
    moves: [
      m('holdHearing', 'Hold hearing', 'Public hearing on AI harms; boosts regulator mandate, dents trust.'),
      m('backRegulator', 'Back regulator', 'Publicly support the regulator; adds political capital.'),
      m('cutRegulatorBudget', 'Cut regulator budget', 'Rein in a regulator seen as overreaching.'),
      m('investigate', 'Investigate', 'Launch investigations; raises loophole detection for a while.'),
      m('monitor', 'Monitor', 'Watch and wait.'),
    ],
  },
};

/** Legal move ids for an actor (derived from MOVE_IDS so types and data never drift). */
export function legalMoves(actor: ActorId): readonly MoveId[] {
  return MOVE_IDS[actor];
}

export function moveDefinition(actor: ActorId, move: MoveId): MoveDefinition | undefined {
  return ACTORS[actor].moves.find((d) => d.id === move);
}
