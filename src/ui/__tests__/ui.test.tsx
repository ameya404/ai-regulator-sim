// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
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
  it('one End year plays 4 quarters with the chosen rules', async () => {
    const { result } = renderHook(() => useSimulation({ storage: null, initialGame: newGame(7) }));
    act(() => {
      result.current.setLevel('safetyTesting', 'strict');
      result.current.setLevel('automationTax', 'light');
    });
    await act(() => result.current.endYear());
    expect(result.current.current.turn).toBe(4);
    expect(result.current.current.policies.safetyTesting.strength).toBe(1);
    expect(result.current.current.policies.automationTax.strength).toBe(0.5);
    // Hidden policies stay off.
    expect(result.current.current.policies.liability.strength).toBe(0);
    expect(result.current.hasPendingChanges).toBe(false);
  });

  it('ends after 5 years', async () => {
    const { result } = renderHook(() => useSimulation({ storage: null, initialGame: newGame(5) }));
    for (let i = 0; i < 5; i++) await act(() => result.current.endYear());
    expect(result.current.current.turn).toBe(20);
    expect(result.current.isOver).toBe(true);
    await act(() => result.current.endYear());
    expect(result.current.current.turn).toBe(20);
  });

  it('autosaves and restores', async () => {
    const storage = new MemoryStorage() as unknown as Storage;
    const first = renderHook(() => useSimulation({ storage, initialGame: newGame(11) }));
    await act(() => first.result.current.endYear());
    first.unmount();
    expect(storage.getItem(SAVE_KEY)).toBeTruthy();
    const second = renderHook(() => useSimulation({ storage }));
    expect(second.result.current.current.turn).toBe(4);
    expect(second.result.current.game.seed).toBe(11);
  });

  it('save files round-trip; bad files give a readable error', () => {
    const g = newGame(3);
    expect(decodeGame(encodeGame(g)).history).toEqual(g.history);
    const { result } = renderHook(() => useSimulation({ storage: null, initialGame: g }));
    act(() => {
      expect(result.current.importGame('not json')).toBe(false);
    });
    expect(result.current.error).toMatch(/not valid JSON/);
  });
});

describe('App', () => {
  it('shows the intro on first visit and dismisses it', () => {
    render(<App storage={null} initialGame={newGame(1)} showIntro />);
    expect(screen.getByRole('dialog', { name: /AI regulator/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Got it/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('plays a year: summary appears, only 3 rules and 3 numbers, nothing hidden leaks', async () => {
    render(<App storage={null} initialGame={newGame(3)} showIntro={false} />);
    expect(screen.getAllByRole('radiogroup')).toHaveLength(3);
    expect(document.querySelectorAll('.kpi')).toHaveLength(3);
    expect(screen.getAllByRole('checkbox')).toHaveLength(1); // only safety testing has "skip"

    const safety = screen.getByRole('radiogroup', { name: 'Safety testing' });
    fireEvent.click(within(safety).getByRole('radio', { name: 'Strict' }));
    expect(within(safety).getByRole('radio', { name: 'Strict' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('New this year')).toBeTruthy();

    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: /End year/ }));
      await waitFor(() => expect(screen.getByRole('button', { name: /End year/ })).toHaveProperty('disabled', false));
    }
    expect(screen.getByText('What happened in 2029')).toBeTruthy();
    const summary = document.querySelectorAll('.summary-body p');
    expect(summary.length).toBeGreaterThanOrEqual(2);
    expect(summary.length).toBeLessThanOrEqual(3);

    // Open details: players and news, still nothing about lobbying.
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    const drawer = screen.getByRole('dialog', { name: 'Details' });
    expect(within(drawer).getByText('Big AI company (Frontier Lab)')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/lobb|loophole|caught|political capital/i);
  });

  it('settings menu holds the secondary actions', () => {
    render(<App storage={null} initialGame={newGame(2)} showIntro={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const items = screen.getAllByRole('menuitem').map((b) => b.textContent);
    expect(items).toEqual(['New game', 'How to play', 'Save game to file', 'Load game from file']);
  });
});
