/**
 * What each move does. Each handler writes its effects into the TurnContext
 * (or directly into small parts of the draft state, e.g. lobbying erosion).
 * All magnitudes come from config.moves / config.loopholes.
 */
import { clamp01, round } from '../math';
import { POLICY_LABELS } from '../policies';
import type { TurnContext } from '../turnContext';
import type { ActorId, Move } from '../types';

type LoopholeId = 'lobby' | 'safetyWashing' | 'complianceTheater';

/** Current probability that a loophole is detected (base + investigations). */
export function detectionChance(ctx: Pick<TurnContext, 'config'> & { draft: { world: { investigationLevel: number } } }, id: LoopholeId): number {
  const c = ctx.config.loopholes;
  return Math.min(c.maxDetectionChance, c[id].detectionChance + ctx.draft.world.investigationLevel);
}

/** Roll for detection; on detection apply fine, trust hit and regulator capital gain. */
function resolveLoophole(ctx: TurnContext, actor: ActorId, id: LoopholeId, what: string): boolean {
  const c = ctx.config.loopholes[id];
  const p = detectionChance(ctx, id);
  const caught = ctx.rng.chance(p);
  if (caught) {
    ctx.spend[actor] += c.fine;
    ctx.trustDelta -= c.trustPenalty;
    ctx.capitalDelta += ctx.config.loopholes.capitalGainOnCatch;
    ctx.log({
      kind: 'loopholeCaught',
      actor,
      move: id,
      message: `${what} exposed! Fined $${c.fine}B; public trust falls.`,
      data: { fine: c.fine, trustPenalty: c.trustPenalty, detectionChance: round(p) },
    });
  } else {
    ctx.log({
      kind: 'loopholeUndetected',
      actor,
      move: id,
      message: `${what} went unnoticed this quarter.`,
      data: { detectionChance: round(p) },
    });
  }
  return caught;
}

export function applyMove(ctx: TurnContext, move: Move): void {
  const { config, draft } = ctx;
  const mv = config.moves;
  const w = draft.world;

  switch (move.type) {
    // ----- Big lab -----
    case 'scaleCompute':
      ctx.spend.bigLab += mv.scaleCompute.cost;
      ctx.momentum.bigLab += mv.scaleCompute.momentum;
      ctx.capabilityBoost += mv.scaleCompute.capabilityBoost;
      ctx.riskMultiplier.bigLab *= mv.scaleCompute.riskMultiplier;
      return;
    case 'investSafety':
      ctx.spend.bigLab += mv.investSafety.cost;
      w.safetyStock.bigLab += mv.investSafety.safetyStockGain;
      return;
    case 'cutPrices':
      ctx.momentum.bigLab += mv.cutPrices.momentum;
      ctx.revenueLoss.bigLab = Math.max(ctx.revenueLoss.bigLab, mv.cutPrices.revenueLoss);
      return;
    case 'lobby': {
      const target = move.target!;
      const c = config.loopholes.lobby;
      ctx.spend.bigLab += c.cost;
      const caught = resolveLoophole(ctx, 'bigLab', 'lobby', `Frontier Lab's lobbying against ${POLICY_LABELS[target]}`);
      if (caught) {
        // Exposure undoes past lobbying on that policy.
        w.lobbyErosion[target] = 0;
      } else {
        w.lobbyErosion[target] = Math.min(c.maxErosion, w.lobbyErosion[target] + c.erosionPerMove);
      }
      return;
    }
    case 'safetyWashing': {
      const caught = resolveLoophole(ctx, 'bigLab', 'safetyWashing', "Frontier Lab's gamed safety tests");
      ctx.safetyAvoided = caught ? 0 : config.loopholes.safetyWashing.burdenAvoided;
      return;
    }

    // ----- Startup -----
    case 'shipFast':
      ctx.spend.startup += mv.shipFast.cost;
      ctx.momentum.startup += mv.shipFast.momentum;
      ctx.capabilityBoost += mv.shipFast.capabilityBoost;
      ctx.riskMultiplier.startup *= mv.shipFast.riskMultiplier;
      return;
    case 'raiseFunding': {
      const c = mv.raiseFunding;
      const p = Math.min(0.95, Math.max(0.05, c.baseChance + c.trustWeight * w.publicTrust + c.shareWeight * w.marketShare.startup));
      const ok = ctx.rng.chance(p);
      if (ok) ctx.income.startup += c.amount;
      ctx.log({
        kind: 'funding',
        actor: 'startup',
        message: ok ? `Upstart AI closes a $${c.amount}B round.` : 'Upstart AI fails to close a funding round.',
        data: { success: ok, chance: round(p) },
      });
      return;
    }
    case 'openRelease':
      ctx.spend.startup += mv.openRelease.cost;
      ctx.momentum.startup += mv.openRelease.momentum;
      ctx.capabilityBoost += mv.openRelease.capabilityBoost;
      ctx.riskMultiplier.startup *= mv.openRelease.riskMultiplier;
      ctx.trustDelta += mv.openRelease.trustGain;
      return;
    case 'applyForSubsidy':
      ctx.startupAppliedForSubsidy = true;
      return;
    case 'conserveCash':
      ctx.rdCut.startup = Math.max(ctx.rdCut.startup, mv.conserveCash.rdCut);
      ctx.momentum.startup += mv.conserveCash.momentum;
      return;

    // ----- Employer -----
    case 'automate':
      ctx.employerAutomation = Math.max(ctx.employerAutomation, move.intensity ?? 1);
      return;
    case 'augmentWorkers':
      ctx.spend.employer += mv.augmentWorkers.cost;
      ctx.employerAugments = true;
      ctx.wageBoost += mv.augmentWorkers.wageBoost;
      return;
    case 'retrainWorkers': {
      const effort = move.intensity ?? 1;
      ctx.spend.employer += mv.retrainWorkers.cost * effort;
      ctx.employerRetrained += mv.retrainWorkers.workersReemployed * effort;
      return;
    }
    case 'complianceTheater': {
      const caught = resolveLoophole(ctx, 'employer', 'complianceTheater', "MegaCorp's rubber-stamp human review");
      ctx.reviewAvoided = caught ? 0 : config.loopholes.complianceTheater.burdenAvoided;
      return;
    }
    case 'holdSteady':
      return;

    // ----- Labor -----
    case 'strike':
      ctx.spend.labor += mv.strike.cost;
      ctx.spend.employer += mv.strike.employerLoss;
      ctx.strike = true;
      ctx.wageBoost += mv.strike.wageBoost;
      ctx.trustDelta += mv.strike.trustEffect;
      return;
    case 'campaign':
      ctx.spend.labor += mv.campaign.cost;
      ctx.capitalDelta += mv.campaign.capitalBoost;
      ctx.trustDelta += mv.campaign.trustEffect;
      return;
    case 'negotiate':
      ctx.wageBoost += mv.negotiate.wageBoost;
      ctx.spend.employer += mv.negotiate.employerCost;
      return;
    case 'partnerRetraining':
      ctx.spend.labor += mv.partnerRetraining.cost;
      ctx.retrainingMultiplier *= mv.partnerRetraining.retrainingMultiplier;
      return;
    case 'standBy':
      return;

    // ----- Public / Congress -----
    case 'holdHearing':
      ctx.capitalDelta += mv.holdHearing.capitalBoost;
      ctx.trustDelta += mv.holdHearing.trustEffect;
      return;
    case 'backRegulator':
      ctx.capitalDelta += mv.backRegulator.capitalBoost;
      return;
    case 'cutRegulatorBudget':
      ctx.capitalDelta -= mv.cutRegulatorBudget.capitalLoss;
      return;
    case 'investigate':
      // Takes effect from next quarter (moves are simultaneous).
      w.investigationLevel = clamp01(w.investigationLevel + mv.investigate.detectionBonus);
      return;
    case 'monitor':
      return;

    default: {
      const never: never = move.type;
      throw new Error(`Unhandled move ${String(never)}`);
    }
  }
}
