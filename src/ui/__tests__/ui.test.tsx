// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { App } from '../App';
import { SAVE_KEY, decodeGame, encodeGame, newGame, useSimulation } from '../useSimulation';

beforeAll(() => {
  // jsdom lacks these; Recharts' ResponsiveContainer and our motion check need them.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key() {
    return null;
  }
  get length() {
    return this.m.size;
  }
}

describe('useSimulation', () => {
  it('drafts policies, ends a quarter, and snaps rejected changes back', async () => {
    const game = newGame(7);
    game.history[0].world.politicalCapital = 25; // enough for safety (22), not also the tax (25)
    const { result } = renderHook(() => useSimulation({ storage: null, initialGame: game }));
    act(() => {
      result.current.setPolicy('safetyTesting', { strength: 1 });
      result.current.setPolicy('automationTax', { strength: 1 });
    });
    expect(result.current.hasPendingChanges).toBe(true);
    await act(() => result.current.endQuarter());
    expect(result.current.current.turn).toBe(1);
    expect(result.current.current.policies.safetyTesting.strength).toBe(1);
    expect(result.current.current.policies.automationTax.strength).toBe(0);
    expect(result.current.pending.automationTax.strength).toBe(0);
    expect(result.current.hasPendingChanges).toBe(false);
  });

  it('autosaves and restores from storage', async () => {
    const storage = new MemoryStorage() as unknown as Storage;
    const first = renderHook(() => useSimulation({ storage, initialGame: newGame(11) }));
    await act(() => first.result.current.endQuarter());
    await act(() => first.result.current.endQuarter());
    first.unmount();
    expect(storage.getItem(SAVE_KEY)).toBeTruthy();
    const second = renderHook(() => useSimulation({ storage }));
    expect(second.result.current.current.turn).toBe(2);
    expect(second.result.current.game.seed).toBe(11);
  });

  it('stops at the final quarter', async () => {
    const g = newGame(5);
    const { result } = renderHook(() => useSimulation({ storage: null, initialGame: { ...g, config: { ...g.config, turns: 2 } } }));
    await act(() => result.current.endQuarter());
    await act(() => result.current.endQuarter());
    expect(result.current.isOver).toBe(true);
    await act(() => result.current.endQuarter());
    expect(result.current.current.turn).toBe(2);
  });

  it('export → import round-trips; bad files give a readable error', () => {
    const g = newGame(3);
    expect(decodeGame(encodeGame(g)).history).toEqual(g.history);
    const { result } = renderHook(() => useSimulation({ storage: null, initialGame: g }));
    act(() => {
      expect(result.current.importGame('{"nope":1}')).toBe(false);
    });
    expect(result.current.error).toMatch(/not an Unintended Consequences save/);
    act(() => {
      expect(result.current.importGame('not json')).toBe(false);
    });
    expect(result.current.error).toMatch(/not valid JSON/);
  });
});

describe('App', () => {
  it('plays a quarter: news appears and hidden info can be revealed', async () => {
    const game = newGame(3);
    // Pre-enact strict safety testing so the lab is tempted to lobby / safety-wash.
    game.history[0].policies.safetyTesting.strength = 1;
    render(<App storage={null} initialGame={game} />);

    expect(screen.getByText(/Nothing has happened yet/)).toBeTruthy();
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole('button', { name: /End quarter/ }));
      await waitFor(() => expect(screen.getByRole('button', { name: /End quarter/ })).toHaveProperty('disabled', false));
    }
    expect(screen.getAllByText('Q4 2027').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.news-item').length).toBeGreaterThan(3);
    expect(document.querySelectorAll('.news-item.is-hidden').length).toBe(0);

    fireEvent.click(screen.getByLabelText(/Show hidden/));
    expect(document.querySelectorAll('.news-item.is-hidden').length).toBeGreaterThan(0);
    // Effective-vs-set strength shows for the enacted policy.
    expect(screen.getAllByText(/Effective/).length).toBeGreaterThan(0);
  });

  it('shows the capital cost of a drafted change and warns when unaffordable', () => {
    const game = newGame(4);
    game.history[0].world.politicalCapital = 10;
    render(<App storage={null} initialGame={game} />);
    fireEvent.change(screen.getByLabelText('Safety testing'), { target: { value: '100' } });
    expect(screen.getByText(/Can’t afford 22/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Safety testing'), { target: { value: '25' } });
    expect(screen.queryByText(/Can’t afford/)).toBeNull();
    expect(screen.getByText('−6')).toBeTruthy(); // 0.25 × 22 = 5.5 → shown rounded
  });
});
