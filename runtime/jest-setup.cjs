// Loaded by flipfactor into every Jest test file it runs (setupFilesAfterEnv).
// Inert unless FLIPFACTOR_SEED or FLIPFACTOR_CLOCK is set.
"use strict";

const seed = process.env.FLIPFACTOR_SEED;
if (seed) {
  // mulberry32, reseeded before each test so a seed means the same sequence
  // no matter which tests ran earlier in the file.
  let state = 0;
  const reseed = () => {
    state = Number(seed) >>> 0;
  };
  Math.random = function flipfactorRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  reseed();
  if (typeof beforeEach === "function") beforeEach(reseed);
}

const clock = process.env.FLIPFACTOR_CLOCK;
if (clock) {
  const RealDate = Date;
  const offset = RealDate.parse(clock) - RealDate.now();
  class FlipfactorDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }
    static now() {
      return RealDate.now() + offset;
    }
  }
  globalThis.Date = FlipfactorDate;
}
