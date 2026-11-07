/**
 * The bridge between React and the simulation engine. This is the only UI
 * module that calls engine functions that change game state.
 *
 * Holds the game (config + full history), the rules the player is drafting
 * for next year, and, when comparing, the finished "Path A". Autosaves to
 * localStorage when available; the game still works if storage is blocked.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cloneState,
  createInitialState,
  deserializeRun,
  serializeRun,
  type PolicyId,
  type PolicySet,
  type SimConfig,
  type WorldState,
} from '../sim';
import { LEVEL_STRENGTH, playQuarters, QUARTERS_PER_YEAR, simpleGameConfig, type Level, type RuleId } from './game';

export const SAVE_KEY = 'unintended-consequences/save-v2';

export interface Game {
  seed: number;
  config: SimConfig;
  history: WorldState[];
  /** The finished first run, kept while the player plays Path B in the same world. */
  pathA?: Game;
}

interface StoredRun {
  seed: number;
  run: string;
}

interface StoredGame extends StoredRun {
  pathA?: StoredRun;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export function newGame(seed: number = randomSeed(), config: SimConfig = simpleGameConfig()): Game {
  return { seed, config, history: [createInitialState(config, seed)] };
}

export function encodeGame(game: Game): string {
  const stored: StoredGame = { seed: game.seed, run: serializeRun(game.config, game.history) };
  if (game.pathA) stored.pathA = { seed: game.pathA.seed, run: serializeRun(game.pathA.config, game.pathA.history) };
  return JSON.stringify(stored);
}

function decodeRun(r: StoredRun): Game {
  const save = deserializeRun(r.run);
  if (save.history.length === 0) throw new Error('Save file has no turns.');
  return { seed: Number(r.seed) || 0, config: save.config, history: save.history };
}

/** Start Path B: the exact starting world of Path A, with A's first-year rules pre-selected. */
export function startPathB(a: Game): { game: Game; rules: PolicySet } {
  const finishedA: Game = { seed: a.seed, config: a.config, history: a.history };
  const rules = cloneState(a.history[Math.min(1, a.history.length - 1)]).policies;
  return { game: { seed: a.seed, config: a.config, history: [cloneState(a.history[0])], pathA: finishedA }, rules };
}

/** Accepts our own save format. Throws with a readable message on bad input. */
export function decodeGame(json: string): Game {
  let parsed: StoredGame;
  try {
    parsed = JSON.parse(json) as StoredGame;
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (typeof parsed?.run !== 'string') throw new Error('That file is not an Unintended Consequences save.');
  const game = decodeRun(parsed);
  if (parsed.pathA) {
    if (typeof parsed.pathA.run !== 'string') throw new Error('The Path A part of that file is damaged.');
    game.pathA = decodeRun(parsed.pathA);
  }
  return game;
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function loadStored(storage: Storage | null): Game | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SAVE_KEY);
    return raw ? decodeGame(raw) : null;
  } catch {
    return null;
  }
}

export interface UseSimulationOptions {
  /** Pass null to disable persistence (tests); defaults to localStorage. */
  storage?: Storage | null;
  /** Start a specific game instead of restoring/creating one. */
  initialGame?: Game;
}

export function useSimulation(options: UseSimulationOptions = {}) {
  const storage = options.storage === undefined ? safeStorage() : options.storage;
  const [game, setGame] = useState<Game>(() => options.initialGame ?? loadStored(storage) ?? newGame());
  const current = game.history[game.history.length - 1];
  const [pending, setPending] = useState<PolicySet>(() => cloneState(current).policies);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  /** Bumps whenever the game is replaced (new game, load, Path B), so screens can react. */
  const [gameKey, setGameKey] = useState(0);

  const isOver = current.turn >= game.config.turns;

  useEffect(() => {
    if (!storage) return;
    try {
      storage.setItem(SAVE_KEY, encodeGame(game));
    } catch {
      // Storage full or blocked: the game continues without autosave.
    }
  }, [game, storage]);

  const replaceGame = useCallback((g: Game, rules?: PolicySet) => {
    setGame(g);
    setPending(rules ?? cloneState(g.history[g.history.length - 1]).policies);
    setError(null);
    setGameKey((k) => k + 1);
  }, []);

  const setPolicy = useCallback((id: PolicyId, patch: Partial<PolicySet[PolicyId]>) => {
    setPending((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  }, []);

  const setLevel = useCallback((rule: RuleId, level: Level) => setPolicy(rule, { strength: LEVEL_STRENGTH[level] }), [setPolicy]);

  const resetPending = useCallback(() => setPending(cloneState(current).policies), [current]);

  /** Play one year: 4 engine quarters with the drafted rules. */
  const endYear = useCallback(async () => {
    if (busyRef.current || isOver) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const steps = Math.min(QUARTERS_PER_YEAR - (current.turn % QUARTERS_PER_YEAR), game.config.turns - current.turn);
      // Same rules every quarter; aligned luck so Path A and Path B face the same random events.
      const added: WorldState[] = await playQuarters(current, steps, game.config, game.seed, pending);
      setGame((g) => ({ ...g, history: [...g.history, ...added] }));
      setPending(cloneState(added[added.length - 1]).policies);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [current, game.config, game.seed, isOver, pending]);

  /** New game; any comparison is dropped. */
  const restart = useCallback((seed?: number) => replaceGame(newGame(seed ?? randomSeed(), game.config)), [game.config, replaceGame]);

  /** Keep the finished game as Path A and replay the same world as Path B. */
  const replayWithDifferentRules = useCallback(() => {
    if (!isOver) return;
    const { game: b, rules } = startPathB(game);
    replaceGame(b, rules);
  }, [game, isOver, replaceGame]);

  /** From the comparison: keep Path A, try another Path B. */
  const retryPathB = useCallback(() => {
    if (!game.pathA) return;
    const { game: b, rules } = startPathB(game.pathA);
    replaceGame(b, rules);
  }, [game.pathA, replaceGame]);

  const importGame = useCallback(
    (json: string) => {
      try {
        replaceGame(decodeGame(json));
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [replaceGame],
  );

  const exportGame = useCallback(() => encodeGame(game), [game]);

  const hasPendingChanges = useMemo(
    () =>
      (Object.keys(pending) as PolicyId[]).some(
        (p) => pending[p].strength !== current.policies[p].strength || pending[p].smallCompanyExemption !== current.policies[p].smallCompanyExemption,
      ),
    [pending, current],
  );

  return {
    game,
    gameKey,
    pathA: game.pathA,
    comparisonReady: Boolean(game.pathA) && isOver,
    current,
    previous: game.history.length > 1 ? game.history[game.history.length - 2] : undefined,
    pending,
    hasPendingChanges,
    busy,
    error,
    isOver,
    setPolicy,
    setLevel,
    resetPending,
    endYear,
    restart,
    replayWithDifferentRules,
    retryPathB,
    importGame,
    exportGame,
    clearError: () => setError(null),
  };
}

export type Simulation = ReturnType<typeof useSimulation>;
