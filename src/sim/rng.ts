/**
 * Small seeded PRNG (mulberry32). The integer state is stored in WorldState,
 * so saving and restoring a state reproduces every later random draw exactly.
 */
export class Rng {
  private s: number;

  constructor(state: number) {
    this.s = state >>> 0;
  }

  /** Current internal state; write this back into WorldState after a turn. */
  get state(): number {
    return this.s;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Poisson-distributed integer (Knuth; fine for small lambda). */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 30) {
      // Normal approximation for large lambda.
      const u = Math.max(this.next(), 1e-12);
      const v = this.next();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return Math.max(0, Math.round(lambda + z * Math.sqrt(lambda)));
    }
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = this.next();
    while (p > limit) {
      k++;
      p *= this.next();
    }
    return k;
  }
}

/** Turn an arbitrary integer seed into a well-mixed initial RNG state. */
export function seedToState(seed: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** 32-bit FNV-1a hash of a label. */
export function hashLabel(label: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mix two 32-bit values into a well-scrambled 32-bit state. */
export function mix32(a: number, b: number): number {
  let h = (a ^ Math.imul(b ^ 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Independent random streams for one turn, each named for who uses it and why
 * (e.g. "startup:funding", "bigLab:detect:lobby", "incidents:other").
 *
 * Each stream starts from (turn's base state, its name), so how many numbers one
 * stream uses never shifts another. That keeps one actor's choices from changing
 * another actor's luck, which matters when comparing two paths.
 * Only the base state is saved; streams are re-derived from it.
 */
export class RngStreams {
  private readonly cache = new Map<string, Rng>();

  constructor(readonly base: number) {}

  get(name: string): Rng {
    let r = this.cache.get(name);
    if (!r) {
      r = new Rng(mix32(this.base, hashLabel(name)));
      this.cache.set(name, r);
    }
    return r;
  }

  /** Base state for the next turn; independent of how many draws this turn made. */
  nextBase(): number {
    return mix32(this.base, hashLabel('next-turn'));
  }
}
