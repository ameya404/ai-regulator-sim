/**
 * Policy mechanics: effective strength (after lobbying), small-company
 * exemptions, and the compliance cost formulas. Pure functions only.
 *
 * Used by the economy (to charge costs) and by decision-makers (to estimate
 * burdens), so both see exactly the same numbers.
 */
import type { SimConfig } from './config';
import { POLICY_IDS, type ActorId, type LabId, type PolicyId, type PolicySet, type WorldMetrics, type WorldState } from './types';

/** The parts of a state the policy formulas need. Satisfied by WorldState and ActorView. */
export type PolicyContext = Pick<WorldState, 'world' | 'policies' | 'actors'>;

export const POLICY_LABELS: Record<PolicyId, string> = {
  safetyTesting: 'Safety testing',
  liability: 'Liability for AI harms',
  startupSubsidy: 'Startup / open research subsidy',
  retrainingFund: 'Retraining fund',
  automationTax: 'Automation tax',
  humanReview: 'Human-review requirement',
};

/** Policies where a small-company exemption has meaning (they impose burdens). */
export const EXEMPTABLE_POLICIES: readonly PolicyId[] = ['safetyTesting', 'liability', 'automationTax', 'humanReview'];

/** Nominal strength reduced by lobbying erosion. */
export function effectiveStrengths(world: WorldMetrics, policies: PolicySet): Record<PolicyId, number> {
  return Object.fromEntries(
    POLICY_IDS.map((p) => [p, policies[p].strength * (1 - world.lobbyErosion[p])]),
  ) as Record<PolicyId, number>;
}

/** Total AI-model market revenue for one quarter ($B). */
export function marketRevenue(config: SimConfig, capability: number, trust: number): number {
  const m = config.market;
  return m.baseRevenue * capability ** m.capabilityElasticity * (m.trustFloor + (1 - m.trustFloor) * trust);
}

/**
 * Does this actor count as a "small company" for exemption purposes?
 * Only labs can be small; the employer is a large employer by definition.
 */
export function qualifiesAsSmall(state: PolicyContext, actor: ActorId, config: SimConfig): boolean {
  if (actor !== 'bigLab' && actor !== 'startup') return false;
  const a = state.actors[actor];
  return a.status === 'active' && a.revenue < config.compliance.smallCompanyRevenueThreshold;
}

/** Multiplier on a policy's burden for an actor: 1, or reduced if exempt. */
export function burdenFactor(state: PolicyContext, policy: PolicyId, actor: ActorId, config: SimConfig): number {
  if (!state.policies[policy].smallCompanyExemption) return 1;
  if (!EXEMPTABLE_POLICIES.includes(policy)) return 1;
  return qualifiesAsSmall(state, actor, config) ? config.compliance.exemptBurdenFraction : 1;
}

/** Cost-efficiency multiplier for compliance: big firms pay less per unit of work. */
export function complianceEfficiency(lab: LabId, config: SimConfig): number {
  return lab === 'bigLab' ? config.compliance.bigFirmEfficiency : 1;
}

export interface LabComplianceInput {
  lab: LabId;
  revenue: number;
  safetyStrength: number;
  liabilityStrength: number;
  burdenSafety: number;
  burdenLiability: number;
  /** Fraction of safety-testing burden avoided via loophole (0 if compliant). */
  safetyAvoided: number;
}

/** Quarterly safety-testing compliance cost for a lab ($B). */
export function safetyTestingCost(i: LabComplianceInput, config: SimConfig): number {
  const p = config.policies.safetyTesting;
  return (
    i.safetyStrength *
    (p.fixedCost + p.revenueRate * i.revenue) *
    complianceEfficiency(i.lab, config) *
    i.burdenSafety *
    (1 - i.safetyAvoided)
  );
}

/** Market-share drag (logit units) from safety testing time-to-market. */
export function safetyTestingDrag(i: LabComplianceInput, config: SimConfig): number {
  const p = config.policies.safetyTesting;
  const sizeFactor = i.lab === 'bigLab' ? p.bigFirmDragFactor : 1;
  return i.safetyStrength * p.marketDrag * sizeFactor * i.burdenSafety * (1 - i.safetyAvoided);
}

/** Fixed liability insurance / legal overhead ($B). Payouts per incident are charged separately. */
export function liabilityOverhead(i: LabComplianceInput, config: SimConfig): number {
  return i.liabilityStrength * config.policies.liability.insuranceCost * complianceEfficiency(i.lab, config) * i.burdenLiability;
}

export function liabilityPayout(incidents: number, strength: number, burden: number, config: SimConfig): number {
  return incidents * strength * config.policies.liability.costPerIncident * burden;
}

/**
 * Rough quarterly burden estimate of each policy for a lab, from the current
 * state. Used by deciders (e.g. to pick a lobbying target).
 */
export function estimateLabBurdens(state: PolicyContext, lab: LabId, config: SimConfig): Partial<Record<PolicyId, number>> {
  const eff = effectiveStrengths(state.world, state.policies);
  const revenue = state.actors[lab].revenue;
  const input: LabComplianceInput = {
    lab,
    revenue,
    safetyStrength: eff.safetyTesting,
    liabilityStrength: eff.liability,
    burdenSafety: burdenFactor(state, 'safetyTesting', lab, config),
    burdenLiability: burdenFactor(state, 'liability', lab, config),
    safetyAvoided: 0,
  };
  // Translate market drag into $ via revenue at stake.
  const dragDollars = safetyTestingDrag(input, config) * revenue;
  const lastIncidents = state.world.safetyIncidents * state.world.marketShare[lab];
  return {
    safetyTesting: safetyTestingCost(input, config) + dragDollars,
    liability:
      liabilityOverhead(input, config) +
      liabilityPayout(lastIncidents, eff.liability, input.burdenLiability, config),
  };
}

/** Quarterly human-review cost to the employer ($B), before any loophole. */
export function humanReviewCost(state: PolicyContext, strength: number, config: SimConfig): number {
  return strength * config.policies.humanReview.costPerMillionAutomated * state.world.automatedJobs;
}
