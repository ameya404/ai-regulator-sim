/**
 * "What happened this year": 2–3 plain-English sentences, each naming a change
 * and its cause. Rule-based and deterministic (same game → same words).
 *
 * Never mentions cheating or lobbying; those are revealed on the end screen.
 */
import { qualifiesAsSmall, totalJobs, type LogEntry, type MoveId, type SimConfig } from '../sim';
import { levelOf, yearIncidents, type YearSlice } from './game';
import { people } from './format';

interface Candidate {
  score: number;
  text: string;
}

const pts = (x: number) => `${Math.round(x * 100)}%`;

function count(log: readonly LogEntry[], actor: string, move: MoveId): number {
  return log.filter((e) => e.kind === 'move' && e.actor === actor && e.move === move).length;
}

export function summarizeYear(slice: YearSlice, previous: YearSlice | undefined, config: SimConfig): string[] {
  const { start, end, quarters } = slice;
  const log = end.log.filter((e) => e.turn > start.turn && e.turn <= end.turn);
  const p = end.policies;
  const safety = levelOf(p.safetyTesting.strength);
  const tax = levelOf(p.automationTax.strength);
  const retraining = levelOf(p.retrainingFund.strength);
  const c: Candidate[] = [];

  // --- The startup's fate -----------------------------------------------------
  const failure = log.find((e) => e.kind === 'startupFailure');
  if (failure) {
    const burden = safety !== 'off' && !p.safetyTesting.smallCompanyExemption ? ', partly because safety testing cost it so much' : '';
    c.push({
      score: 100,
      text:
        failure.data?.outcome === 'acquired'
          ? `The startup ran out of money${burden}, and the big AI company bought it.`
          : `The startup ran out of money${burden} and shut down.`,
    });
  }

  // --- AI market ----------------------------------------------------------------
  const shareA = start.world.marketShare.bigLab;
  const shareB = end.world.marketShare.bigLab;
  const dShare = (shareB - shareA) * 100;
  const startupPaysForSafety =
    safety !== 'off' && !(p.safetyTesting.smallCompanyExemption && qualifiesAsSmall(start, 'startup', config));
  if (!failure) {
    if (dShare >= 1) {
      if (startupPaysForSafety && start.actors.startup.status === 'active') {
        c.push({
          score: 50 + dShare * 4,
          text: `Safety testing cost the small startup much more than the big AI company, so the big company's share of the AI market grew from ${pts(shareA)} to ${pts(shareB)}.`,
        });
      } else if (count(log, 'bigLab', 'cutPrices') > 0) {
        c.push({ score: 40 + dShare * 4, text: `The big AI company cut its prices to fight the startup and grew its market share from ${pts(shareA)} to ${pts(shareB)}.` });
      } else {
        c.push({ score: 35 + dShare * 4, text: `The big AI company spent billions on bigger AI models and grew its market share from ${pts(shareA)} to ${pts(shareB)}.` });
      }
    } else if (dShare <= -1) {
      const exemptHelped = safety !== 'off' && p.safetyTesting.smallCompanyExemption && end.world.marketShare.startup > start.world.marketShare.startup;
      c.push({
        score: 40 + -dShare * 4,
        text: exemptHelped
          ? `Because small companies could skip safety testing, the startup grew to ${pts(end.world.marketShare.startup)} of the market and the big AI company slipped to ${pts(shareB)}.`
          : `Smaller AI companies gained ground, and the big AI company slipped from ${pts(shareA)} to ${pts(shareB)} of the market.`,
      });
    } else {
      c.push({ score: 8, text: `The AI market barely moved: the big AI company still has ${pts(shareB)} of it.` });
    }
  }

  // --- Jobs -----------------------------------------------------------------------
  const displaced = quarters.reduce((a, s) => a + s.world.newlyDisplaced, 0);
  const automations = count(log, 'employer', 'automate');
  const augments = count(log, 'employer', 'augmentWorkers');
  const strikes = count(log, 'labor', 'strike');
  const dOutOfWork = end.world.displacedWorkers - start.world.displacedWorkers;
  const dJobs = totalJobs(end) - totalJobs(start);

  // world.automatedJobs counts the big employer's automation only; the rest is the wider economy.
  const byEmployer = Math.max(0, end.world.automatedJobs - start.world.automatedJobs);
  if (displaced >= 0.3) {
    const strikeNote = strikes > 0 ? ' Workers went on strike in protest.' : '';
    const employerNote = byEmployer >= 0.05 ? `, about ${people(byEmployer)} of them at MegaCorp, a big employer` : '';
    c.push({ score: 45 + displaced * 10, text: `AI replaced about ${people(displaced)} workers this year${employerNote}.${strikeNote}` });
  }
  if (tax !== 'off' && augments > automations) {
    c.push({
      score: 48,
      text: `The automation tax made replacing workers expensive, so MegaCorp mostly gave its workers AI tools instead of firing them.`,
    });
  }
  if (retraining !== 'off') {
    c.push(
      dOutOfWork < -0.05
        ? { score: 32 + -dOutOfWork * 10, text: `The retraining fund helped people who lost jobs find new work: ${people(-dOutOfWork)} fewer people are out of work than a year ago.` }
        : { score: 30, text: `The retraining fund helped, but job losses were faster: ${people(Math.max(0, dOutOfWork))} more people are out of work than a year ago.` },
    );
  } else if (Math.abs(dJobs) >= 0.3 && displaced < 0.3) {
    c.push({ score: 25, text: dJobs < 0 ? `About ${people(-dJobs)} jobs disappeared as AI spread through the economy.` : `About ${people(dJobs)} new jobs appeared as AI created new kinds of work.` });
  }

  // --- Safety incidents -----------------------------------------------------------
  const incidents = yearIncidents(slice);
  if (previous) {
    const before = yearIncidents(previous);
    const d = incidents - before;
    if (d >= 3) {
      const why = safety === 'off' ? ' as AI got more powerful and no safety testing was required' : ' as AI got more powerful';
      c.push({ score: 35 + d * 2, text: `AI safety incidents rose from ${before} to ${incidents}${why}.` });
    } else if (d <= -3) {
      c.push({ score: 35 + -d * 2, text: safety !== 'off' ? `Safety testing paid off: AI safety incidents fell from ${before} to ${incidents}.` : `AI safety incidents fell from ${before} to ${incidents}.` });
    } else {
      c.push({ score: 12, text: `There were ${incidents} AI safety incidents, about the same as last year.` });
    }
  } else {
    c.push({
      score: safety !== 'off' ? 22 : 15,
      text: safety !== 'off' ? `With safety testing in place, there were ${incidents} AI safety incidents this year.` : `There were ${incidents} AI safety incidents this year, with no safety testing required.`,
    });
  }
  if (count(log, 'public', 'holdHearing') > 0) {
    c.push({ score: 20, text: 'Congress held public hearings about the harm AI was causing.' });
  }

  // --- Startup money ----------------------------------------------------------------
  const raised = log.filter((e) => e.kind === 'funding' && e.data?.success).length;
  if (raised > 0 && !failure) c.push({ score: 10, text: 'The startup raised new money from investors to stay afloat.' });

  return c
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.text);
}
