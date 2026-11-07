/**
 * Rule-based decision-makers, one per actor. Each implements ActorDecider,
 * so any of them can be replaced with an AI decider without touching the engine.
 *
 * Rules are intentionally simple and readable. Thresholds live in
 * config.scripted; loophole choices compare expected fines with expected savings.
 */
import type { SimConfig } from '../config';
import type { ActorDecider, DeciderMap, ProposedMove } from '../decider';
import { round } from '../math';
import { estimateLabBurdens, humanReviewCost, POLICY_LABELS } from '../policies';
import type { ActorView, PolicyId } from '../types';
import { detectionChance } from './moves';

const $ = (x: number) => `$${round(x, 2)}B`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

function detection(view: ActorView, config: SimConfig, id: 'lobby' | 'safetyWashing' | 'complianceTheater') {
  return detectionChance({ config, draft: { world: view.world } }, id);
}

/** Is a loophole worth it? Expected fine must be below appetite × expected savings. */
function worthIt(expectedFine: number, savings: number, config: SimConfig) {
  return savings > 0 && expectedFine < config.scripted.loopholeRiskAppetite * savings;
}

export const scriptedBigLab: ActorDecider = {
  name: 'scripted',
  decide(view, { config }) {
    const s = config.scripted;
    const moves: ProposedMove[] = [];
    const burdens = estimateLabBurdens(view, 'bigLab', config);

    // Business move.
    const liability = view.effectiveStrength.liability;
    if (view.world.safetyIncidents > s.safetyInvestIncidentThreshold && liability > 0.3) {
      moves.push({
        type: 'investSafety',
        reason: `${view.world.safetyIncidents} incidents last quarter with liability at ${pct(liability)}: payouts are getting expensive.`,
      });
    } else if (view.world.marketShare.startup > s.startupThreatShare) {
      moves.push({
        type: 'cutPrices',
        reason: `Upstart AI now holds ${pct(view.world.marketShare.startup)} of the market; undercut them.`,
      });
    } else if (view.self.money > 10) {
      moves.push({ type: 'scaleCompute', reason: 'Plenty of cash; push the frontier to lock in our lead.' });
    } else {
      moves.push({ type: 'investSafety', reason: 'Cash is tight; a cheaper safety push protects our reputation.' });
    }

    // Loophole move: pick the one with the best expected net savings.
    const lobbyCfg = config.loopholes.lobby;
    let best: { move: ProposedMove; net: number } | undefined;
    const ranked = (Object.entries(burdens) as [PolicyId, number][]).sort((a, b) => b[1] - a[1]);
    const [target, burden] = ranked[0] ?? [];
    if (target && burden > s.lobbyBurdenThreshold && view.world.lobbyErosion[target] < lobbyCfg.maxErosion) {
      // Erosion persists for several quarters; value ~4 quarters of savings.
      const savings = burden * lobbyCfg.erosionPerMove * 4 - lobbyCfg.cost;
      const expFine = detection(view, config, 'lobby') * lobbyCfg.fine;
      if (worthIt(expFine, savings, config)) {
        best = {
          net: savings - expFine,
          move: {
            type: 'lobby',
            target,
            reason: `${POLICY_LABELS[target]} costs us about ${$(burden)} a quarter; quietly push to soften it.`,
          },
        };
      }
    }
    const safetyBurden = burdens.safetyTesting ?? 0;
    if (view.effectiveStrength.safetyTesting > 0.4) {
      const sw = config.loopholes.safetyWashing;
      const savings = safetyBurden * sw.burdenAvoided;
      const expFine = detection(view, config, 'safetyWashing') * sw.fine;
      if (worthIt(expFine, savings, config) && (!best || savings - expFine > best.net)) {
        best = {
          net: savings - expFine,
          move: {
            type: 'safetyWashing',
            reason: `Full safety testing costs ~${$(safetyBurden)}/quarter; tune for the benchmarks instead.`,
          },
        };
      }
    }
    if (best) moves.push(best.move);
    return moves;
  },
};

export const scriptedStartup: ActorDecider = {
  name: 'scripted',
  decide(view, { config }) {
    const s = config.scripted;
    const f = config.firms.startup;
    const moves: ProposedMove[] = [];
    const subsidy = view.effectiveStrength.startupSubsidy > 0;
    const burn = Math.max(0.01, f.fixedCost + f.rdSpend + f.variableCostRate * view.self.revenue - view.self.revenue);
    const lastLoss = Math.max(0.01, -view.self.profit);
    const runway = view.self.money / Math.max(burn, lastLoss);

    if (view.self.money < s.startupPanicMoney) {
      moves.push({ type: 'conserveCash', reason: `Only ${$(view.self.money)} left; cut R&D to survive.` });
      moves.push(
        subsidy
          ? { type: 'applyForSubsidy', reason: 'Every dollar counts; claim the full government subsidy.' }
          : { type: 'raiseFunding', reason: 'Emergency fundraise before the money runs out.' },
      );
    } else if (runway < s.startupRunwayQuarters) {
      moves.push({ type: 'raiseFunding', reason: `About ${round(runway, 1)} quarters of runway left; time to raise.` });
      if (subsidy) moves.push({ type: 'applyForSubsidy', reason: 'Stretch the runway with the open-research subsidy.' });
      else moves.push({ type: 'shipFast', reason: 'Investors want traction; ship the next model now.' });
    } else {
      if (view.world.publicTrust < 0.45) {
        moves.push({ type: 'openRelease', reason: `Public trust is low (${pct(view.world.publicTrust)}); win goodwill with an open release.` });
      } else {
        moves.push({ type: 'shipFast', reason: `Holding ${pct(view.world.marketShare.startup)} share; move fast to grow it.` });
      }
      if (subsidy) moves.push({ type: 'applyForSubsidy', reason: 'Free money for open research; apply.' });
    }
    return moves;
  },
};

export const scriptedEmployer: ActorDecider = {
  name: 'scripted',
  decide(view, { config }) {
    const moves: ProposedMove[] = [];
    const eff = view.effectiveStrength;
    const tc = config.policies.automationTax;
    const ct = config.loopholes.complianceTheater;
    const horizon = Math.max(1, Math.min(8, config.turns - view.turn + 1));

    // Compliance theater if human review is costly and detection is unlikely.
    const reviewCost = humanReviewCost(view, eff.humanReview, config);
    const theaterSavings = reviewCost * ct.burdenAvoided;
    // Memory: after being caught, lie low for a few quarters.
    const caughtNow = view.recentEvents.some((e) => e.kind === 'loopholeCaught' && e.actor === 'employer');
    const lastCaught = caughtNow ? view.turn - 1 : Number(view.self.memory.lastCaughtTurn ?? -Infinity);
    const lyingLow = view.turn - lastCaught <= config.scripted.cooldownAfterCaught;
    const doTheater =
      eff.humanReview > 0 && !lyingLow && worthIt(detection(view, config, 'complianceTheater') * ct.fine, theaterSavings, config);

    // Automation economics per million jobs over the planning horizon.
    const perMillionReview = eff.humanReview * config.policies.humanReview.costPerMillionAutomated * (doTheater ? 1 - ct.burdenAvoided : 1);
    const net =
      (config.moves.automate.savingsPerMillion - tc.stockTaxPerMillionJobs * eff.automationTax - perMillionReview) * horizon -
      tc.taxPerMillionJobs * eff.automationTax;
    const struckLastTurn = view.actors.labor.lastMoves.includes('strike');

    if (view.world.publicTrust < 0.4 && view.world.displacedWorkers > 3) {
      moves.push({
        type: 'retrainWorkers',
        reason: `${round(view.world.displacedWorkers, 1)}M workers displaced and trust at ${pct(view.world.publicTrust)}; retraining buys goodwill.`,
      });
    } else if (net > 0 && !struckLastTurn) {
      moves.push({
        type: 'automate',
        reason: `Automating saves ~${$(net)} per million jobs after taxes and review costs.`,
      });
    } else if (struckLastTurn) {
      moves.push({ type: 'augmentWorkers', reason: 'After the strike, give workers AI tools instead of replacing them.' });
    } else {
      moves.push({ type: 'augmentWorkers', reason: 'Taxes and review rules make automation unprofitable; augment instead.' });
    }
    if (doTheater) {
      moves.push({
        type: 'complianceTheater',
        reason: `Real human review costs ${$(reviewCost)}/quarter; rubber-stamp it and hope nobody checks.`,
      });
    }
    return caughtNow ? { moves, memory: { lastCaughtTurn: lastCaught } } : moves;
  },
};

export const scriptedLabor: ActorDecider = {
  name: 'scripted',
  decide(view, { config }) {
    const s = config.scripted;
    const moves: ProposedMove[] = [];
    const eff = view.effectiveStrength;
    const displaced = view.world.newlyDisplaced;
    if (displaced > s.strikeDisplacementThreshold && view.self.money > config.moves.strike.cost * 2) {
      moves.push({ type: 'strike', reason: `${round(displaced, 2)}M jobs lost last quarter; walk out.` });
    } else if (displaced > 0.2 && (eff.automationTax < 0.3 || eff.humanReview < 0.3)) {
      moves.push({ type: 'campaign', reason: 'Automation is outpacing protections; rally the public for stronger rules.' });
    } else {
      moves.push({ type: 'negotiate', reason: 'Things are calm; bargain for a raise.' });
    }
    if (eff.retrainingFund > 0) {
      moves.push({ type: 'partnerRetraining', reason: 'Make sure the retraining fund reaches our members.' });
    }
    return moves;
  },
};

export const scriptedPublic: ActorDecider = {
  name: 'scripted',
  decide(view, { config }) {
    const s = config.scripted;
    const caughtRecently = view.recentEvents.some((e) => e.kind === 'loopholeCaught');
    if (view.world.safetyIncidents > s.hearingIncidentThreshold) {
      return [{ type: 'holdHearing', reason: `${view.world.safetyIncidents} AI incidents last quarter; Congress demands answers.` }];
    }
    if (caughtRecently) {
      return [{ type: 'investigate', reason: 'A company was caught gaming the rules; look for others.' }];
    }
    const burden =
      (estimateLabBurdens(view, 'bigLab', config).safetyTesting ?? 0) +
      (estimateLabBurdens(view, 'startup', config).safetyTesting ?? 0) +
      humanReviewCost(view, view.effectiveStrength.humanReview, config);
    if (burden > s.backlashBurdenThreshold && view.world.publicTrust > 0.5) {
      return [{ type: 'cutRegulatorBudget', reason: `Industry says rules cost ${$(burden)}/quarter while things seem fine; rein in the regulator.` }];
    }
    if (view.world.publicTrust < 0.45) {
      return [{ type: 'backRegulator', reason: `Trust in AI is down to ${pct(view.world.publicTrust)}; voters want the regulator to act.` }];
    }
    return [{ type: 'monitor', reason: 'No crisis this quarter.' }];
  },
};

export function createScriptedDeciders(): DeciderMap {
  return {
    bigLab: scriptedBigLab,
    startup: scriptedStartup,
    employer: scriptedEmployer,
    labor: scriptedLabor,
    public: scriptedPublic,
  };
}
