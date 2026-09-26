// A small, seedable PRNG so simulation runs are reproducible from a fixed seed —
// important for a study whose results need to be re-run and checked, not just generated once.

export interface Rng {
  next(): number; // uniform in [0, 1)
  normal(mean?: number, std?: number): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  function next(): number {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  let spareNormal: number | null = null;

  function normal(mean = 0, std = 1): number {
    if (spareNormal !== null) {
      const value = spareNormal;
      spareNormal = null;
      return mean + std * value;
    }
    let u1 = 0;
    do {
      u1 = next();
    } while (u1 === 0); // avoid log(0)
    const u2 = next();
    const mag = Math.sqrt(-2 * Math.log(u1));
    spareNormal = mag * Math.sin(2 * Math.PI * u2);
    return mean + std * mag * Math.cos(2 * Math.PI * u2);
  }

  return { next, normal };
}
