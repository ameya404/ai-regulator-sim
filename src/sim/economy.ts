/**
 * World dynamics for one quarter, applied after all moves are in.
 *
 * Order: decay → programs (public budget) → market & lab finances →
 * incidents & liability → labor market → wages → employer/labor finances →
 * trust → political capital → startup failure.
 */
import type { SimConfig } from './config';
import { clamp, clamp01, round, sum } from './math';
import {
  burdenFactor,
  effectiveStrengths,
  humanReviewCost,
  liabilityOverhead,
  liabilityPayout,
  marketRevenue,
  safetyTestingCost,
  safetyTestingDrag,
  type LabComplianceInput,
} from './policies';
import type { TurnContext } from './turnContext';
import { SECTORS, type LabId, type Sector, type WorldState } from './types';

const LABS: readonly LabId[] = ['bigLab', 'startup'];

/** Decay of persistent effects; called at the start of a turn, before moves. */
export function applyStartOfTurnDecay(state: WorldState, config: SimConfig): void {
  const w = state.world;
  for (const p of Object.keys(w.lobbyErosion) as (keyof typeof w.lobbyErosion)[]) {
    w.lobbyErosion[p] *= 1 - config.loopholes.lobby.erosionDecay;
  }
  for (const lab of LABS) w.safetyStock[lab] *= 1 - config.incidents.safetyStockDecay;
  w.investigationLevel *= 0.5;
}

/** Per-quarter breakdown, attached to the log for the news feed / debugging. */
export interface EconomyReport {
  complianceCost: Record<LabId, number>;
  incidentsBySource: Record<LabId | 'other', number>;
  newlyDisplaced: number;
  reemployed: number;
}

export function updateEconomy(ctx: TurnContext): EconomyReport {
  const { config: c, draft, rng } = ctx;
  const w = draft.world;
  const actors = draft.actors;
  const eff = effectiveStrengths(w, draft.policies);
  const startupActive = actors.startup.status === 'active';

  // ---------------------------------------------------------------- programs
  const pub = actors.public;
  const available = Math.max(0, pub.money + c.publicBudget.baseAppropriation);
  const subsidyWanted = startupActive
    ? eff.startupSubsidy * c.policies.startupSubsidy.maxPayout * (ctx.startupAppliedForSubsidy ? 1 : c.policies.startupSubsidy.passiveFraction)
    : 0;
  const retrainWanted = eff.retrainingFund * c.policies.retrainingFund.maxSpend;
  const wanted = subsidyWanted + retrainWanted;
  const scale = wanted > available && wanted > 0 ? available / wanted : 1;
  if (scale < 1) {
    ctx.log({
      kind: 'program',
      actor: 'public',
      message: `Program budget short: subsidy and retraining paid at ${Math.round(scale * 100)}%.`,
      data: { wanted: round(wanted), available: round(available) },
    });
  }
  const subsidyPaid = subsidyWanted * scale;
  const retrainSpent = retrainWanted * scale;
  pub.money = available - subsidyPaid - retrainSpent;
  ctx.income.startup += subsidyPaid;

  // ---------------------------------------------------------------- compliance inputs
  const compliance: Record<LabId, LabComplianceInput> = {
    bigLab: {
      lab: 'bigLab',
      revenue: 0, // filled below
      safetyStrength: eff.safetyTesting,
      liabilityStrength: eff.liability,
      burdenSafety: burdenFactor(draft, 'safetyTesting', 'bigLab', c),
      burdenLiability: burdenFactor(draft, 'liability', 'bigLab', c),
      safetyAvoided: ctx.safetyAvoided,
    },
    startup: {
      lab: 'startup',
      revenue: 0,
      safetyStrength: eff.safetyTesting,
      liabilityStrength: eff.liability,
      burdenSafety: burdenFactor(draft, 'safetyTesting', 'startup', c),
      burdenLiability: burdenFactor(draft, 'liability', 'startup', c),
      safetyAvoided: 0,
    },
  };

  // ---------------------------------------------------------------- capability
  const capBefore = w.aiCapability;
  const frontierSlowdown =
    eff.safetyTesting * c.policies.safetyTesting.capabilitySlowdown * compliance.bigLab.burdenSafety * (1 - ctx.safetyAvoided);
  const growth =
    c.capability.baseGrowth * (1 - frontierSlowdown) +
    ctx.capabilityBoost +
    (subsidyPaid > 0 ? eff.startupSubsidy * c.policies.startupSubsidy.capabilityBoost * scale : 0);
  w.aiCapability = capBefore * (1 + growth);

  // ---------------------------------------------------------------- market & revenue
  const market = marketRevenue(c, capBefore, w.publicTrust);
  const share = w.marketShare;
  const revenue: Record<LabId, number> = { bigLab: 0, startup: 0 };
  for (const lab of LABS) {
    if (lab === 'startup' && !startupActive) continue;
    revenue[lab] = share[lab] * market * (1 - ctx.revenueLoss[lab]);
    compliance[lab].revenue = revenue[lab];
  }

  // Market share update: logit step by momentum minus compliance drag.
  const drag: Record<LabId | 'other', number> = {
    bigLab: safetyTestingDrag(compliance.bigLab, c),
    startup: safetyTestingDrag(compliance.startup, c),
    other: eff.safetyTesting * c.policies.safetyTesting.marketDrag * c.firms.otherComplianceEfficiency,
  };
  const k = c.market.shareSensitivity;
  const logits: Record<LabId | 'other', number> = {
    bigLab: Math.log(Math.max(share.bigLab, 1e-9)) + k * (ctx.momentum.bigLab + c.market.incumbentAdvantage - drag.bigLab),
    startup: startupActive ? Math.log(Math.max(share.startup, 1e-9)) + k * (ctx.momentum.startup - drag.startup) : -Infinity,
    other: Math.log(Math.max(share.other, 1e-9)) + k * (c.market.otherMomentum - drag.other),
  };
  const exps = { bigLab: Math.exp(logits.bigLab), startup: Math.exp(logits.startup), other: Math.exp(logits.other) };
  const total = exps.bigLab + exps.startup + exps.other;
  w.marketShare = { bigLab: exps.bigLab / total, startup: exps.startup / total, other: exps.other / total };

  // ---------------------------------------------------------------- incidents
  const inc = c.incidents;
  const deploymentFactor = 1 + w.automatedJobs * inc.deploymentPerMillionAutomated;
  const reviewMitigation =
    eff.humanReview * c.policies.humanReview.incidentReduction * (1 - ctx.reviewAvoided);
  const capFactor = capBefore ** inc.capabilityElasticity;
  const lambda = (source: LabId | 'other'): number => {
    const sh = share[source]; // pre-update share: who was serving the market this quarter
    const risk = inc.providerRisk[source];
    let mult = 1;
    let safetyMitigation = eff.safetyTesting * c.policies.safetyTesting.incidentReduction;
    if (source !== 'other') {
      mult = ctx.riskMultiplier[source] / (1 + w.safetyStock[source] * inc.safetyStockEffect);
      safetyMitigation *= compliance[source].burdenSafety * (1 - compliance[source].safetyAvoided);
    }
    return inc.baseRate * sh * capFactor * risk * mult * deploymentFactor * (1 - safetyMitigation) * (1 - reviewMitigation);
  };
  const incidentsBySource = {
    bigLab: rng.poisson(lambda('bigLab')),
    startup: startupActive ? rng.poisson(lambda('startup')) : 0,
    other: rng.poisson(lambda('other')),
  };
  const incidents = incidentsBySource.bigLab + incidentsBySource.startup + incidentsBySource.other;
  w.safetyIncidents = incidents;
  w.cumulativeIncidents += incidents;
  if (incidents > 0) {
    ctx.log({
      kind: 'incident',
      message: `${incidents} AI safety incident${incidents === 1 ? '' : 's'} this quarter.`,
      data: { ...incidentsBySource },
    });
  }

  // ---------------------------------------------------------------- lab finances
  const complianceCost: Record<LabId, number> = { bigLab: 0, startup: 0 };
  for (const lab of LABS) {
    const a = actors[lab];
    if (a.status !== 'active') {
      a.revenue = 0;
      a.profit = 0;
      continue;
    }
    const f = c.firms[lab];
    const comp =
      safetyTestingCost(compliance[lab], c) +
      liabilityOverhead(compliance[lab], c) +
      liabilityPayout(incidentsBySource[lab], eff.liability, compliance[lab].burdenLiability, c);
    complianceCost[lab] = comp;
    const operating = f.fixedCost + f.variableCostRate * revenue[lab] + f.rdSpend * (1 - ctx.rdCut[lab]);
    const profit = revenue[lab] - operating - comp - ctx.spend[lab] + ctx.income[lab];
    a.revenue = revenue[lab];
    a.profit = profit;
    a.money += profit;
  }

  // ---------------------------------------------------------------- labor market
  const lab = c.labor;
  const hr = c.policies.humanReview;
  const reviewSlow = eff.humanReview * hr.automationSlowdown * (1 - ctx.reviewAvoided);
  const liabilityDeter = eff.liability * c.policies.liability.automationDeterrence;
  const strikeSlow = ctx.strike ? c.moves.strike.automationSlowdown : 0;

  const jobsBefore = { ...w.jobs };
  const displacedBySector = Object.fromEntries(SECTORS.map((s) => [s, 0])) as Record<Sector, number>;

  // Employer automation push.
  let employerAutomated = 0;
  if (ctx.employerAutomation > 0) {
    const exposed = sum(SECTORS.map((s) => jobsBefore[s] * lab.exposure[s]));
    const target = c.moves.automate.rate * ctx.employerAutomation * exposed * (1 - reviewSlow) * (1 - liabilityDeter) * (1 - strikeSlow);
    for (const s of SECTORS) {
      const d = Math.min(jobsBefore[s] * lab.exposure[s], target * lab.employerSectorMix[s]);
      displacedBySector[s] += d;
      employerAutomated += d;
    }
  }

  // Background automation across the rest of the economy (small and mid firms).
  const tax = c.policies.automationTax;
  const smallShare = tax.smallFirmAutomationShare;
  const taxCoverage = draft.policies.automationTax.smallCompanyExemption ? 1 - smallShare : 1;
  const reviewCoverage = draft.policies.humanReview.smallCompanyExemption ? 1 - smallShare : 1;
  const bgRate =
    lab.backgroundAutomationRate *
    capBefore ** lab.backgroundCapabilityElasticity *
    (1 - eff.automationTax * tax.backgroundDeterrence * taxCoverage) *
    (1 - eff.humanReview * hr.automationSlowdown * reviewCoverage) *
    (1 - liabilityDeter);
  let backgroundAutomated = 0;
  for (const s of SECTORS) {
    const d = jobsBefore[s] * lab.exposure[s] * bgRate;
    displacedBySector[s] += d;
    backgroundAutomated += d;
  }

  const newlyDisplaced = employerAutomated + backgroundAutomated;
  for (const s of SECTORS) w.jobs[s] = Math.max(0, w.jobs[s] - displacedBySector[s]);
  w.automatedJobs += employerAutomated;
  w.displacedWorkers += newlyDisplaced;
  w.newlyDisplaced = newlyDisplaced;

  // Re-employment: unaided matching + AI-driven job creation + retraining.
  const created = lab.jobCreationPerCapabilityGrowth * Math.max(0, w.aiCapability - capBefore);
  const fundReemployed = retrainSpent * c.policies.retrainingFund.workersPerBillion * ctx.retrainingMultiplier;
  const reemployed = Math.min(
    w.displacedWorkers * lab.maxReemploymentPerQuarter,
    w.displacedWorkers * lab.baseReemploymentRate + created + fundReemployed + ctx.employerRetrained,
  );
  w.displacedWorkers -= reemployed;
  for (const s of SECTORS) w.jobs[s] += reemployed * lab.reemploymentMix[s];

  // ---------------------------------------------------------------- wages
  const laborForce = sum(SECTORS.map((s) => w.jobs[s])) + w.displacedWorkers;
  const slack = laborForce > 0 ? w.displacedWorkers / laborForce : 0;
  for (const s of SECTORS) {
    const sectorAutomationRate = jobsBefore[s] > 0 ? displacedBySector[s] / jobsBefore[s] : 0;
    const g =
      lab.baseWageGrowth +
      ctx.wageBoost -
      lab.displacementWagePressure * sectorAutomationRate -
      lab.slackWagePressure * slack;
    w.wages[s] = Math.max(10, w.wages[s] * (1 + g));
  }

  // ---------------------------------------------------------------- employer
  const emp = actors.employer;
  const savings = c.moves.automate.savingsPerMillion * w.automatedJobs;
  const automationTaxPaid = eff.automationTax * (tax.taxPerMillionJobs * employerAutomated + tax.stockTaxPerMillionJobs * w.automatedJobs);
  const reviewCost = humanReviewCost(draft, eff.humanReview, c) * (1 - ctx.reviewAvoided);
  const deployerLiability = incidents * eff.liability * c.policies.liability.costPerIncident * c.employer.deployerLiabilityShare;
  const augment = ctx.employerAugments ? c.moves.augmentWorkers.profitBoost : 0;
  const empRevenue = c.employer.baseProfit + savings + augment;
  emp.revenue = empRevenue;
  emp.profit = empRevenue - automationTaxPaid - reviewCost - deployerLiability - ctx.spend.employer + ctx.income.employer;
  emp.money += emp.profit;

  // Background automation tax (paid by the wider economy) + employer tax → program budget.
  const backgroundTax = eff.automationTax * tax.taxPerMillionJobs * backgroundAutomated * taxCoverage;
  pub.money += (automationTaxPaid + backgroundTax) * c.publicBudget.taxEarmark - ctx.spend.public + ctx.income.public;
  pub.revenue = c.publicBudget.baseAppropriation + automationTaxPaid + backgroundTax;
  pub.profit = pub.revenue - subsidyPaid - retrainSpent;

  // ---------------------------------------------------------------- labor coalition
  const lc = actors.labor;
  const dues = lab.duesPerMillionWorkers * sum(SECTORS.map((s) => w.jobs[s]));
  lc.revenue = dues;
  lc.profit = dues - ctx.spend.labor + ctx.income.labor;
  lc.money += lc.profit;

  // ---------------------------------------------------------------- trust
  const t = c.trust;
  const retrainShare = c.policies.retrainingFund.maxSpend > 0 ? retrainSpent / c.policies.retrainingFund.maxSpend : 0;
  w.publicTrust = clamp01(
    w.publicTrust +
      t.recoveryRate * (t.baseline - w.publicTrust) -
      t.perIncident * incidents -
      t.perMillionDisplaced * newlyDisplaced +
      c.policies.retrainingFund.trustBonus * retrainShare +
      t.safetyRegulationBonus * eff.safetyTesting +
      ctx.trustDelta,
  );

  // ---------------------------------------------------------------- political capital
  const pc = c.politicalCapital;
  w.politicalCapital = clamp(
    w.politicalCapital +
      pc.regen +
      pc.trustSensitivity * (w.publicTrust - 0.5) -
      pc.perMillionDisplaced * newlyDisplaced -
      pc.perExcessIncident * Math.max(0, incidents - pc.incidentTolerance) +
      ctx.capitalDelta,
    0,
    pc.max,
  );

  // ---------------------------------------------------------------- startup failure
  resolveStartupFailure(ctx);

  return { complianceCost, incidentsBySource, newlyDisplaced, reemployed };
}

/**
 * If the startup's cash goes negative it either gets acquired by the big lab
 * (if antitrust allows and the lab can pay) or shuts down. Market share moves.
 */
export function resolveStartupFailure(ctx: TurnContext): void {
  const { config: c, draft, rng } = ctx;
  const s = draft.actors.startup;
  const lab = draft.actors.bigLab;
  if (s.status !== 'active' || s.money >= 0) return;

  const f = c.startupFailure;
  const sh = draft.world.marketShare;
  const price = Math.max(f.minPrice, sh.startup * f.shareValuationMultiple);
  const antitrustOk = sh.bigLab + sh.startup <= f.antitrustShareCap;
  const affordable = lab.status === 'active' && lab.money >= price;
  const acquired = antitrustOk && affordable && rng.chance(f.acquisitionProbability);
  const startupShare = sh.startup;

  if (acquired) {
    lab.money -= price;
    draft.world.marketShare = { bigLab: sh.bigLab + startupShare, startup: 0, other: sh.other };
    draft.world.aiCapability *= 1 + f.acquisitionCapabilityBoost;
    s.status = 'acquired';
    ctx.log({
      kind: 'startupFailure',
      actor: 'startup',
      message: `Upstart AI runs out of cash and is acquired by Frontier Lab for $${round(price, 2)}B.`,
      data: { outcome: 'acquired', price: round(price), shareTransferred: round(startupShare) },
    });
  } else {
    const toLab = startupShare * c.market.shutdownShareToBigLab;
    draft.world.marketShare = { bigLab: sh.bigLab + toLab, startup: 0, other: sh.other + (startupShare - toLab) };
    s.status = 'shutDown';
    const why = !antitrustOk ? 'antitrust blocks a sale' : !affordable ? 'no buyer can pay' : 'no buyer steps in';
    ctx.log({
      kind: 'startupFailure',
      actor: 'startup',
      message: `Upstart AI runs out of cash and shuts down (${why}).`,
      data: { outcome: 'shutDown', shareToBigLab: round(toLab), shareToOther: round(startupShare - toLab) },
    });
  }
  s.money = 0;
  s.revenue = 0;
  s.profit = 0;
}
