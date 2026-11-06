# Unintended Consequences

An interactive simulation where you play a US AI regulator. A fictional economy reacts to your policies over 20 quarters.

- **Stage 1:** simulation engine (`src/sim`)
- **Stage 2:** war-room dashboard UI (`src/ui`)
- **Next:** rewind and branching

```bash
npm install
npm run dev                                # play it at http://localhost:5173
npm test                                   # vitest (engine + UI)
npm run build                              # production build → dist/
npm run sim                                # 20 turns, no policies
npm run sim -- --safetyTesting=1           # strict safety testing
npm run sim -- --safetyTesting=1:exempt --humanReview=0.6 --seed=7 --events
```

`npm run sim` options: `--<policy>=<0..1>[:exempt]`, `--seed=N`, `--turns=N`, `--events` (full log with move reasons), `--json` (final state).
Policies: `safetyTesting`, `liability`, `startupSubsidy`, `retrainingFund`, `automationTax`, `humanReview`.

## The dashboard

- **Policy panel:** 6 sliders and small-company exemption toggles. The political-capital cost appears as you draft. Changes the engine would reject are flagged before you press **End quarter**.
- **Charts** (keys `1`–`5` switch tabs): market share, jobs and displaced workers, wages, capability and incidents, trust and capital. A vertical marker shows each quarter where enacted policy changed. Hover a marker for details. Every chart has a table view.
- **Newswire:** headlines built from the event log, each with the actor's stated reason.
- **Show hidden:** reveals what a real regulator couldn't see: undetected loopholes, filler moves, and each policy's effective strength next to the strength you set (the gap is lobbying).
- **End screen:** compares your record with a "do nothing" run from the same start and seed, and lists unintended consequences, including loopholes that went undetected.
- **Saves:** autosaves to the browser, with **Export**/**Import** for JSON save files.

The theme is dark only, and type scales with the screen (about 16px on a laptop, about 20px on a 1080p projector). At 1920×1080 the whole dashboard fits on one screen without scrolling.

## Deploying to Vercel

Import the repo in Vercel; no settings needed. `vercel.json` pins the Vite preset, `npm ci`, `npm run build` and `dist/`. The build runs the TypeScript check first, so type errors fail the deploy.

## Layout

```
src/sim/                  engine — never imports React or UI code
  config.ts               EVERY tunable assumption (compliance efficiency, detection chances, …)
  types.ts                WorldState, Move, PolicySet, LogEntry, ActorView
  state.ts                initial state, save/load (JSON), derived selectors
  rng.ts                  seeded PRNG; its state is saved inside WorldState
  policies.ts             effective strength (after lobbying), exemptions, compliance-cost formulas
  decider.ts              ActorDecider interface (swap scripted rules for an AI here)
  actors/definitions.ts   the 5 actors, their goals and fixed move lists
  actors/moves.ts         what each move does, incl. loophole detection
  actors/scriptedDecider.ts  rule-based deciders with template reasons
  economy.ts              market, incidents, jobs, wages, trust, capital, startup failure
  engine.ts               step() and runSimulation()
  index.ts                public API for the UI
src/ui/                   dashboard (React + Recharts)
  useSimulation.ts        the only bridge to the engine: history, drafted policies, autosave, import/export
  derive.ts               history → chart rows, policy markers, cost preview, end-game comparison
  format.ts               quarter labels, log entry → headline, hidden-info rules
  theme.ts                validated dark chart palette
  components/             Header, KpiRow, PolicyPanel, Charts, NewsFeed, ActorStrip, EndScreen
scripts/sim.ts            CLI summary table
```

## Turn order

1. Clone the previous state and decay lasting effects (lobbying erosion, safety investment, investigations).
2. **Regulator** policy changes, paid for with political capital. A change the regulator can't afford is rejected and logged.
3. **Actors decide at the same time**, each from a read-only copy of the same state.
4. Moves are checked (legal, targeted, not duplicated, within the per-turn limit), logged **with their reason**, and applied.
   Loophole moves (`lobby`, `safetyWashing`, `complianceTheater`) roll for detection. If caught, the actor pays a fine, public trust drops, and the regulator gains capital.
5. Economy update. If the startup's cash is negative, it is **acquired** by the big lab (all its share moves to the lab) or **shut down** (share split between the lab and other firms). Acquisition is blocked by antitrust above a combined share cap.

## Rewind and branching

`step(state, opts)` never mutates its input. `runSimulation` returns `history: WorldState[]`, with index 0 as the start.
Each state is plain JSON and includes the RNG state and the full log:

- **Rewind:** use `history[n]`.
- **Branch:** `runSimulation({ initialState: history[n], policies: other })`.
- **Save:** `serializeRun(config, history)` / `deserializeRun(json)`.

Continuing from a saved state reproduces an uninterrupted run exactly (there's a test for this).

## Plugging in an AI decider

```ts
const llmLab: ActorDecider = {
  name: 'claude',
  async decide(view, { definition }) {
    // view: world, own state + memory, policies, effective strengths, last turn's events
    // definition: actor goals + legal moves (with descriptions)
    return { moves: [{ type: 'lobby', target: 'liability', reason: '...' }], memory: { plan: '...' } };
  },
};
await step(state, { deciders: { bigLab: llmLab } }); // other actors stay scripted
```

The engine validates whatever comes back, so a malformed AI response is logged as `invalidMove` instead of crashing the game.

## Units

Money in $B · shares and trust 0–1 · jobs in millions · wages in $K/yr · political capital 0–100 · capability index (1.0 = start).
