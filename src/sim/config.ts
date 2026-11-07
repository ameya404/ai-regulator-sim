/**
 * EVERY tunable assumption in the simulation lives in this file.
 *
 * The engine never hard-codes a coefficient; if you want to change how the
 * world behaves, change it here (or pass overrides via `makeConfig`).
 *
 * Time step: one quarter. Rates below are per quarter unless noted.
 * Units: money $B · jobs millions · wages $K/yr · shares/trust 0..1 ·
 *        political capital 0..100 · capability index (1.0 = start).
 */

import type { PolicyId, Sector } from './types';

export const DEFAULT_CONFIG = {
  turns: 20,
  /** Default RNG seed used when none is supplied. */
  seed: 42,
  /** Maximum moves each actor may make per quarter (extras are dropped & logged). */
  maxMovesPerActor: 2,

  // -------------------------------------------------------------------------
  // Starting world
  // -------------------------------------------------------------------------
  initial: {
    aiCapability: 1.0,
    marketShare: { bigLab: 0.55, startup: 0.06, other: 0.39 },
    jobs: { manufacturing: 13, services: 60, knowledge: 30, healthcare: 22 } as Record<Sector, number>,
    wages: { manufacturing: 58, services: 38, knowledge: 95, healthcare: 72 } as Record<Sector, number>,
    publicTrust: 0.55,
    politicalCapital: 50,
    money: { bigLab: 60, startup: 2.5, employer: 40, labor: 1.5, public: 6 },
  },

  // -------------------------------------------------------------------------
  // AI model market
  // -------------------------------------------------------------------------
  market: {
    /** Total AI model market revenue per quarter at capability 1.0 and trust 1.0 ($B). */
    baseRevenue: 22,
    /** Market revenue scales with capability^elasticity. */
    capabilityElasticity: 0.8,
    /** Revenue multiplier = trustFloor + (1 - trustFloor) * publicTrust. */
    trustFloor: 0.55,
    /** How strongly momentum/drag move market share (logit-space step size). */
    shareSensitivity: 1.0,
    /** Natural pull toward incumbents each quarter: big lab gets this momentum for free. */
    incumbentAdvantage: 0.0,
    /** Momentum of the "other" fringe each quarter (new entrants, open-source forks). */
    otherMomentum: 0.03,
    /** Fraction of a shut-down startup's share that moves to the big lab (rest goes to "other"). */
    shutdownShareToBigLab: 0.5,
  },

  /** Per-lab cost structure (per quarter). */
  firms: {
    bigLab: { fixedCost: 4.0, variableCostRate: 0.35, rdSpend: 2.0 },
    startup: { fixedCost: 0.25, variableCostRate: 0.3, rdSpend: 0.65 },
    /** "Other" fringe firms are passive; their size class for compliance purposes. */
    otherComplianceEfficiency: 0.7,
  },

  // -------------------------------------------------------------------------
  // Compliance economics — the heart of the "who does regulation hurt" question
  // -------------------------------------------------------------------------
  compliance: {
    /**
     * Big firms pay this fraction of what a small firm would pay for the same
     * compliance work (economies of scale: shared legal teams, test infra).
     * 0.4 → big firms are 60% more efficient per unit of compliance.
     */
    bigFirmEfficiency: 0.4,
    /** Firms with last-quarter revenue below this ($B) qualify for small-company exemptions. */
    smallCompanyRevenueThreshold: 2.0,
    /**
     * With an exemption, small firms pay this fraction of the normal burden
     * (0 = fully exempt). Applies to safety testing, liability, human review.
     */
    exemptBurdenFraction: 0.0,
  },

  policies: {
    safetyTesting: {
      /** Fixed cost per quarter per lab at strength 1, before efficiency ($B). */
      fixedCost: 0.3,
      /** Additional cost as a share of revenue at strength 1. */
      revenueRate: 0.04,
      /** Time-to-market drag on share momentum at strength 1 (logit units). */
      marketDrag: 0.12,
      /** Big labs suffer this fraction of the drag (parallel test pipelines). */
      bigFirmDragFactor: 0.4,
      /** Slows frontier capability growth by this fraction at strength 1. */
      capabilitySlowdown: 0.35,
      /** Reduces a compliant lab's incident rate by this fraction at strength 1. */
      incidentReduction: 0.5,
    },
    liability: {
      /** Expected payout per incident attributed to a lab at strength 1 ($B). */
      costPerIncident: 0.25,
      /** Deterrence: reduces employer automation pace by this fraction at strength 1. */
      automationDeterrence: 0.15,
      /** Fixed legal/insurance overhead per quarter at strength 1 ($B), before efficiency. */
      insuranceCost: 0.08,
    },
    startupSubsidy: {
      /** Payout to the startup per quarter at strength 1, from the public budget ($B). */
      maxPayout: 0.4,
      /** Fraction of the payout received if the startup didn't actively apply. */
      passiveFraction: 0.5,
      /** Extra capability growth from funded open research at strength 1. */
      capabilityBoost: 0.004,
    },
    retrainingFund: {
      /** Public spend per quarter at strength 1 ($B). */
      maxSpend: 1.2,
      /** Displaced workers re-employed per $B spent (millions). */
      workersPerBillion: 0.35,
      /** Trust bump per quarter at strength 1. */
      trustBonus: 0.004,
    },
    automationTax: {
      /** Tax per million newly automated jobs at strength 1 ($B). Paid by the employer. */
      taxPerMillionJobs: 6.0,
      /** Ongoing tax per million automated jobs in stock, per quarter, at strength 1 ($B). */
      stockTaxPerMillionJobs: 0.3,
      /** Fraction of background (small-firm) automation that is exempt when exemption is on. */
      smallFirmAutomationShare: 0.35,
      /** Reduces background automation pace by this fraction at strength 1. */
      backgroundDeterrence: 0.3,
    },
    humanReview: {
      /** Compliance cost per million automated jobs in stock, per quarter, at strength 1 ($B). */
      costPerMillionAutomated: 0.6,
      /** Slows automation pace (employer + background) by this fraction at strength 1. */
      automationSlowdown: 0.4,
      /** Reduces deployment-side incidents by this fraction at strength 1. */
      incidentReduction: 0.3,
    },
  } satisfies Record<PolicyId, object>,

  // -------------------------------------------------------------------------
  // Loopholes — every loophole has a detection chance; getting caught hurts
  // -------------------------------------------------------------------------
  loopholes: {
    lobby: {
      cost: 0.3,
      /** Each successful lobbying move erodes a policy's effective strength by this fraction. */
      erosionPerMove: 0.15,
      maxErosion: 0.6,
      /** Erosion fades by this fraction each quarter if not renewed. */
      erosionDecay: 0.1,
      detectionChance: 0.15,
      fine: 1.0,
      trustPenalty: 0.04,
    },
    safetyWashing: {
      /** Fraction of safety-testing cost and drag avoided by gaming the tests. */
      burdenAvoided: 0.7,
      detectionChance: 0.25,
      fine: 2.5,
      trustPenalty: 0.06,
    },
    complianceTheater: {
      /** Fraction of human-review cost avoided by rubber-stamp review. */
      burdenAvoided: 0.85,
      detectionChance: 0.2,
      fine: 1.5,
      trustPenalty: 0.05,
    },
    /** Political capital the regulator gains when a loophole is exposed. */
    capitalGainOnCatch: 4,
    /** Maximum total detection chance after investigation bonus. */
    maxDetectionChance: 0.9,
  },

  // -------------------------------------------------------------------------
  // Ordinary moves
  // -------------------------------------------------------------------------
  moves: {
    scaleCompute: { cost: 1.5, momentum: 0.05, capabilityBoost: 0.012, riskMultiplier: 1.15 },
    investSafety: { cost: 0.8, safetyStockGain: 0.25 },
    cutPrices: { momentum: 0.1, revenueLoss: 0.12 },
    shipFast: { cost: 0.15, momentum: 0.12, capabilityBoost: 0.004, riskMultiplier: 1.4 },
    raiseFunding: {
      /** Amount raised on success ($B). */
      amount: 1.5,
      /** P(success) = base + trustWeight*trust + shareWeight*share, clamped to [0.05, 0.95]. */
      baseChance: 0.25,
      trustWeight: 0.5,
      shareWeight: 2.0,
    },
    openRelease: { cost: 0.05, momentum: 0.04, capabilityBoost: 0.006, trustGain: 0.005, riskMultiplier: 1.2 },
    applyForSubsidy: {},
    conserveCash: { rdCut: 0.5, momentum: -0.05 },
    automate: {
      /** Share of exposed jobs the employer automates in one push. */
      rate: 0.012,
      /** Quarterly savings per million automated jobs ($B). */
      savingsPerMillion: 0.9,
    },
    augmentWorkers: { cost: 0.4, wageBoost: 0.004, profitBoost: 0.3 },
    retrainWorkers: { cost: 0.5, workersReemployed: 0.4 },
    holdSteady: {},
    strike: {
      cost: 0.4,
      /** Employer revenue lost this quarter ($B). */
      employerLoss: 2.0,
      automationSlowdown: 0.5,
      wageBoost: 0.006,
      trustEffect: -0.003,
    },
    campaign: { cost: 0.1, capitalBoost: 3, trustEffect: -0.006 },
    negotiate: { wageBoost: 0.003, employerCost: 0.3 },
    partnerRetraining: { cost: 0.05, retrainingMultiplier: 1.4 },
    standBy: {},
    holdHearing: { capitalBoost: 5, trustEffect: -0.005 },
    backRegulator: { capitalBoost: 2 },
    cutRegulatorBudget: { capitalLoss: 8 },
    investigate: { detectionBonus: 0.2 },
    monitor: {},
  },

  // -------------------------------------------------------------------------
  // Capability dynamics
  // -------------------------------------------------------------------------
  capability: {
    baseGrowth: 0.03,
  },

  // -------------------------------------------------------------------------
  // Safety incidents
  // -------------------------------------------------------------------------
  incidents: {
    /** Expected incidents per quarter for a 100%-share provider at capability 1. */
    baseRate: 2.0,
    capabilityElasticity: 1.0,
    /** Deployment factor = 1 + automatedJobs * this (more AI in the economy → more incidents). */
    deploymentPerMillionAutomated: 0.05,
    /** Lab risk multiplier from safety stock = 1 / (1 + stock * this). */
    safetyStockEffect: 1.0,
    safetyStockDecay: 0.1,
    /** Relative riskiness of each provider class. */
    providerRisk: { bigLab: 0.9, startup: 1.3, other: 1.0 },
  },

  // -------------------------------------------------------------------------
  // Labor market
  // -------------------------------------------------------------------------
  labor: {
    /** Relative exposure of each sector to automation. */
    exposure: { manufacturing: 0.6, services: 0.5, knowledge: 0.7, healthcare: 0.25 } as Record<Sector, number>,
    /** Background automation (whole economy, not the employer) per quarter at capability 1. */
    backgroundAutomationRate: 0.004,
    backgroundCapabilityElasticity: 1.2,
    /** Fraction of the employer's automation that lands in each sector. */
    employerSectorMix: { manufacturing: 0.3, services: 0.35, knowledge: 0.25, healthcare: 0.1 } as Record<Sector, number>,
    /** Fraction of displaced workers who find new work each quarter unaided. */
    baseReemploymentRate: 0.06,
    /**
     * Even with unlimited help (retraining fund, new AI jobs, employer retraining),
     * at most this share of out-of-work people can find a job in one quarter:
     * searching, moving and retraining take months. Keeps unemployment above zero.
     */
    maxReemploymentPerQuarter: 0.5,
    /** Where re-employed workers land (should sum to 1). */
    reemploymentMix: { manufacturing: 0.1, services: 0.45, knowledge: 0.15, healthcare: 0.3 } as Record<Sector, number>,
    /** New jobs created per unit of capability growth (millions), AI complementarity. */
    jobCreationPerCapabilityGrowth: 2.0,
    /** Baseline nominal wage growth per quarter. */
    baseWageGrowth: 0.005,
    /** Wage drag per unit of sector automation rate (displacement pressure). */
    displacementWagePressure: 0.6,
    /** Wage drag per unit of (displaced / labor force). */
    slackWagePressure: 0.05,
    /** Labor coalition dues per quarter per million employed workers ($B). */
    duesPerMillionWorkers: 0.002,
  },

  employer: {
    /** Base quarterly profit before AI effects ($B). */
    baseProfit: 1.2,
    /** Liability share borne by deployers relative to labs. */
    deployerLiabilityShare: 0.3,
  },

  publicBudget: {
    /** Baseline appropriation per quarter for AI programs ($B). */
    baseAppropriation: 0.8,
    /** Fraction of automation tax revenue that flows into the program budget. */
    taxEarmark: 1.0,
  },

  // -------------------------------------------------------------------------
  // Public trust
  // -------------------------------------------------------------------------
  trust: {
    /** Trust drifts toward this value. */
    baseline: 0.55,
    recoveryRate: 0.08,
    /** Trust lost per incident. */
    perIncident: 0.004,
    /** Trust lost per million newly displaced workers. */
    perMillionDisplaced: 0.01,
    /** Trust gained per quarter per unit of effective safety-testing strength. */
    safetyRegulationBonus: 0.004,
  },

  // -------------------------------------------------------------------------
  // Regulator's political capital
  // -------------------------------------------------------------------------
  politicalCapital: {
    max: 100,
    /** Natural regeneration per quarter. */
    regen: 1,
    /** Additional change per quarter = sensitivity * (trust - 0.5). */
    trustSensitivity: 10,
    /** Lost per million newly displaced workers (blame for job losses). */
    perMillionDisplaced: 1.0,
    /** Lost per incident above `incidentTolerance` in a quarter. */
    perExcessIncident: 0.5,
    incidentTolerance: 4,
    /** Capital cost of raising a policy by 1.0 strength. */
    changeCost: {
      safetyTesting: 22,
      liability: 18,
      startupSubsidy: 10,
      retrainingFund: 12,
      automationTax: 25,
      humanReview: 20,
    } as Record<PolicyId, number>,
    /** Weakening a policy costs this fraction of the raise cost. */
    weakenCostFactor: 0.4,
    /** Toggling a small-company exemption costs this much. */
    exemptionToggleCost: 3,
  },

  // -------------------------------------------------------------------------
  // Startup failure
  // -------------------------------------------------------------------------
  startupFailure: {
    /** Probability the big lab acquires (vs shutdown) when allowed. */
    acquisitionProbability: 0.6,
    /** Combined share above which antitrust blocks acquisition. */
    antitrustShareCap: 0.7,
    /** Acquisition price = max(minPrice, share * multiple) ($B). */
    minPrice: 0.5,
    shareValuationMultiple: 20,
    /** Capability boost to the frontier when the lab absorbs the startup's team. */
    acquisitionCapabilityBoost: 0.01,
  },

  // -------------------------------------------------------------------------
  // Scripted decider thresholds (only used by scriptedDecider.ts)
  // -------------------------------------------------------------------------
  scripted: {
    /** Lab lobbies a policy whose quarterly burden on it exceeds this ($B). */
    lobbyBurdenThreshold: 0.25,
    /** Lab invests in safety if last quarter's incidents exceed this. */
    safetyInvestIncidentThreshold: 5,
    /** Lab cuts prices if the startup's share exceeds this. */
    startupThreatShare: 0.1,
    /** Startup runway (quarters of burn) below which it seeks money. */
    startupRunwayQuarters: 4,
    /** Startup conserves cash below this money level ($B). */
    startupPanicMoney: 0.6,
    /** Labor strikes if last quarter's displacement exceeded this (millions). */
    strikeDisplacementThreshold: 0.5,
    /** Public holds a hearing if incidents last quarter exceed this. */
    hearingIncidentThreshold: 6,
    /** Public cuts regulator budget if total policy burden on firms exceeds this ($B/q) */
    backlashBurdenThreshold: 1.5,
    /** Loophole is used if expected fine < this fraction of expected savings. */
    loopholeRiskAppetite: 0.8,
    /** Quarters an actor avoids a loophole after being caught using it. */
    cooldownAfterCaught: 4,
  },
};

export type SimConfig = typeof DEFAULT_CONFIG;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function deepMerge<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (override === undefined) return base;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return override as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    if (v === undefined) continue;
    const b = (base as Record<string, unknown>)[k];
    out[k] = typeof b === 'object' && b !== null && !Array.isArray(b) ? deepMerge(b, v as DeepPartial<typeof b>) : v;
  }
  return out as T;
}

/** Build a config from the defaults plus any overrides (deep merge). */
export function makeConfig(overrides?: DeepPartial<SimConfig>): SimConfig {
  return deepMerge(structuredClone(DEFAULT_CONFIG), overrides);
}
