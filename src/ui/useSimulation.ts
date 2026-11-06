/**
 * The bridge between React and the simulation engine. This is the only UI
 * module that calls engine functions that change game state.
 *
 * Holds the game (config + full history), the policies the player is
 * drafting for next quarter, and the "show hidden" toggle. Autosaves to
 * localStorage when available; the game still works if storage is blocked.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_CONFIG,
  cloneState,
  createInitialState,
  deserializeRun,
  serializeRun,
  step,
  type PolicyId,
  type PolicySet,
  type SimConfig,
  type WorldState,
} from '../sim';

export const SAVE_KEY = 'unintended-consequences/save-v1';

export interface Game {
  seed: number;
  config: SimConfig;
  history: WorldState[];
}

interface StoredGame {
  seed: number;
  run: string;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export function newGame(seed: number = randomSeed(), config: SimConfig = DEFAULT_CONFIG): Game {
  return { seed, config, history: [createInitialState(config, seed)] };
}

export function encodeGame(game: Game): string {
  const stored: StoredGame = { seed: game.seed, run: serializeRun(game.config, game.history) };
  return JSON.stringify(stored);
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
  const save = deserializeRun(parsed.run);
  if (save.history.length === 0) throw new Error('Save file has no turns.');
  return { seed: Number(parsed.seed) || 0, config: save.config, history: save.history };
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

  const isOver = current.turn >= game.config.turns;

  useEffect(() => {
    if (!storage) return;
    try {
      storage.setItem(SAVE_KEY, encodeGame(game));
    } catch {
      // Storage full or blocked: the game continues without autosave.
    }
  }, [game, storage]);

  const replaceGame = useCallback((g: Game) => {
    setGame(g);
    setPending(cloneState(g.history[g.history.length - 1]).policies);
    setError(null);
  }, []);

  const setPolicy = useCallback((id: PolicyId, patch: Partial<PolicySet[PolicyId]>) => {
    setPending((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  }, []);

  const resetPending = useCallback(() => setPending(cloneState(current).policies), [current]);

  const endQuarter = useCallback(async () => {
    if (busyRef.current || isOver) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const next = await step(current, { config: game.config, policies: pending });
      setGame((g) => ({ ...g, history: [...g.history, next] }));
      // Rejected changes snap back to what was actually enacted.
      setPending(cloneState(next).policies);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [current, game.config, isOver, pending]);

  const restart = useCallback((seed?: number) => replaceGame(newGame(seed ?? randomSeed(), game.config)), [game.config, replaceGame]);

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
    current,
    previous: game.history.length > 1 ? game.history[game.history.length - 2] : undefined,
    pending,
    hasPendingChanges,
    busy,
    error,
    isOver,
    setPolicy,
    resetPending,
    endQuarter,
    restart,
    importGame,
    exportGame,
    clearError: () => setError(null),
  };
}

export type Simulation = ReturnType<typeof useSimulation>;
