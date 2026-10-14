import { classify, counts, headline, judgeVariants, rankFindings, summarise, type Variant } from "./analysis.js";
import { hasTaskset } from "./exec.js";
import { median } from "./stats.js";
import type { Adapter, AxisName, Capabilities, Evidence, Finding, RunSpec, TestDiagnosis } from "./types.js";

export interface EngineOptions {
  axes: AxisName[];
  /** Runs per baseline condition (alone, in file). */
  baselineRuns: number;
  /** Runs per perturbed value. */
  repeats: number;
  /** Extra runs used to confirm a flip before calling it deterministic. */
  confirmRuns: number;
  timezones: string[];
  locales: string[];
  seeds: number[];
  clocks: string[];
  shuffles: number;
  cpuSlowdown: number;
  workers: number;
  scope?: string;
  inheritedTz: string;
  inheritedLocale: string;
  log: (msg: string) => void;
}

export function defaultClocks(now = new Date()): string[] {
  const y = now.getFullYear();
  let leap = y + 1;
  while (!(leap % 4 === 0 && (leap % 100 !== 0 || leap % 400 === 0))) leap++;
  // Local wall-clock times (no Z): "the machine's clock reads ...".
  return [`${y}-12-31T23:59:30`, `${y + 1}-01-31T23:59:30`, `${leap}-02-29T12:00:00`, `${y + 1}-03-01T00:00:05`];
}

export const DEFAULTS = {
  baselineRuns: 3,
  repeats: 2,
  confirmRuns: 2,
  timezones: ["UTC", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Auckland", "Pacific/Kiritimati"],
  locales: ["de_DE.UTF-8", "tr_TR.UTF-8", "ar_EG.UTF-8"],
  seeds: [1, 2, 3, 4, 5, 6],
  shuffles: 4,
  cpuSlowdown: 8,
  workers: 4,
};

interface Sample {
  failed: boolean;
  durationMs: number;
}

export class Engine {
  runs = 0;
  private caps!: Capabilities;
  /** Factors already explained and held fixed for the remaining axes. */
  private control: Partial<RunSpec> = {};

  constructor(
    private readonly adapter: Adapter,
    private readonly opts: EngineOptions,
  ) {}

  private async sample(spec: RunSpec, target: string, n: number): Promise<Sample[]> {
    const out: Sample[] = [];
    for (let i = 0; i < n; i++) {
      const res = await this.adapter.run(spec);
      this.runs++;
      if (res.error) throw new Error(`runner failed for ${this.adapter.reproCommand(spec)}\n${res.error}`);
      const o = res.outcomes.get(target);
      if (!o || o.outcome === "missing") {
        throw new Error(`runner did not report ${target}; check the test id (command: ${this.adapter.reproCommand(spec)})`);
      }
      if (o.outcome === "skip") continue;
      out.push({ failed: o.outcome === "fail", durationMs: o.durationMs });
    }
    return out;
  }

  private async evidence(label: string, spec: RunSpec, target: string, n: number): Promise<Evidence> {
    const s = await this.sample(spec, target, n);
    const ev: Evidence = { label, runs: s.length, failed: s.filter((x) => x.failed).length };
    const m = median(s.map((x) => x.durationMs));
    if (m !== undefined) ev.medianMs = Math.round(m * 10) / 10;
    this.opts.log(`  ${label}: ${counts(ev)} failed`);
    return ev;
  }

  async diagnose(target: string): Promise<TestDiagnosis> {
    this.caps = await this.adapter.capabilities();
    const startRuns = this.runs;
    this.opts.log(`diagnosing ${target}`);
    const neighbours = await this.adapter.neighbours(target);
    if (!neighbours.includes(target)) {
      throw new Error(`${target} is not among the tests the runner collected:\n  ${neighbours.join("\n  ")}`);
    }
    const alone: RunSpec = { tests: [target], env: {} };
    const isolated = await this.evidence("alone", alone, target, this.opts.baselineRuns);
    const unit = this.adapter.name === "go" ? "package" : "file";
    const suite = await this.evidence(`whole ${unit}, default order`, { tests: neighbours, env: {} }, target, this.opts.baselineRuns);

    const findings: Finding[] = [];
    // The seed axis runs first. If it explains the failure, later axes run
    // with a passing seed pinned, so a randomly flaky test cannot make some
    // unrelated factor look guilty by chance.
    const axes = this.opts.axes.includes("seed") ? ["seed" as const, ...this.opts.axes.filter((a) => a !== "seed")] : this.opts.axes;
    this.control = {};
    let reference = isolated;
    for (const axis of axes) {
      const f = await this.axis(axis, target, neighbours, reference, suite);
      if (!f) continue;
      findings.push(f);
      if (axis === "seed" && f.strength === "deterministic") {
        const pin = f.evidence.map((e) => /^seed (\d+)$/.exec(e.label)).find((m, i) => m && f.evidence[i]!.failed === 0);
        if (pin) {
          this.control = { rngSeed: Number(pin[1]) };
          this.opts.log(`  pinning seed ${pin[1]} for the remaining axes`);
          reference = await this.evidence(`alone, seed ${pin[1]}`, { tests: [target], env: {}, ...this.control }, target, this.opts.baselineRuns);
        }
      }
    }
    const classification = classify(isolated, suite, findings);
    return {
      id: target,
      classification,
      headline: headline(classification, findings, isolated, suite),
      baseline: { isolated, suite },
      findings: rankFindings(findings),
      runs: this.runs - startRuns,
    };
  }

  private skipped(axis: AxisName, reason: string): Finding {
    this.opts.log(`  ${axis}: skipped (${reason})`);
    return { axis, strength: "skipped", summary: reason, evidence: [] };
  }

  private async axis(axis: AxisName, target: string, neighbours: string[], isolated: Evidence, suite: Evidence): Promise<Finding | undefined> {
    switch (axis) {
      case "order":
        return this.orderAxis(target, neighbours, isolated, suite);
      case "parallel":
        if (!this.caps.parallel) return this.skipped(axis, `${this.adapter.name} cannot run in parallel here (pytest needs pytest-xdist)`);
        return this.parallelAxis(target);
      case "timezone":
        return this.envAxis(axis, target, isolated, `inherited TZ (${this.opts.inheritedTz})`,
          this.opts.timezones.map((tz) => ({ value: `TZ=${tz}`, spec: { tests: [target], env: { TZ: tz } } })));
      case "locale":
        if (!this.caps.locale) return this.skipped(axis, `${this.adapter.name} does not read the locale from the environment`);
        return this.envAxis(axis, target, isolated, `inherited locale (${this.opts.inheritedLocale})`,
          this.opts.locales.map((l) => ({ value: `LC_ALL=${l}`, spec: { tests: [target], env: { LC_ALL: l, LANG: l } } })));
      case "seed":
        if (!this.caps.seed) return this.skipped(axis, `${this.adapter.name} has no global random seed to control`);
        return this.envAxis(axis, target, isolated, "unseeded",
          this.opts.seeds.map((s) => ({ value: `seed ${s}`, spec: { tests: [target], env: {}, rngSeed: s } })));
      case "clock":
        if (!this.caps.clock) {
          return this.skipped(axis, this.adapter.name === "go"
            ? "Go reads the clock through the vDSO, which libfaketime cannot intercept"
            : "libfaketime is not installed (apt-get install faketime)");
        }
        return this.envAxis(axis, target, isolated, "real clock",
          this.opts.clocks.map((c) => ({ value: `clock ${c.replace("T", " ")}`, spec: { tests: [target], env: {}, clock: c } })));
      case "cpu":
        if (!hasTaskset()) return this.skipped(axis, "CPU slowdown needs Linux taskset");
        return this.envAxis(axis, target, isolated, "normal speed",
          [{ value: `CPU slowed ~${this.opts.cpuSlowdown}x`, spec: { tests: [target], env: {}, cpuSlowdown: this.opts.cpuSlowdown } }]);
    }
  }

  private async envAxis(
    axis: AxisName,
    target: string,
    isolated: Evidence,
    referenceLabel: string,
    conditions: { value: string; spec: RunSpec }[],
  ): Promise<Finding> {
    this.opts.log(` ${axis}`);
    const variants: Variant[] = [{ value: referenceLabel, ev: { ...isolated, label: referenceLabel }, reference: true }];
    const specs = new Map<string, RunSpec>();
    for (const raw of conditions) {
      const c = { ...raw, spec: { ...this.control, ...raw.spec } };
      specs.set(c.value, c.spec);
      variants.push({ value: c.value, ev: await this.evidence(c.value, c.spec, target, this.opts.repeats) });
    }
    let verdict = judgeVariants(variants);
    // Confirm a flip with fresh runs before trusting it: a random flake can
    // look deterministic over two runs by chance.
    if (verdict.strength === "deterministic" && this.opts.confirmRuns > 0) {
      for (const v of [verdict.failing.find((x) => !x.reference), verdict.passing.find((x) => !x.reference)]) {
        if (!v) continue;
        const extra = await this.evidence(`${v.value} (confirm)`, specs.get(v.value)!, target, this.opts.confirmRuns);
        v.ev = { ...v.ev, runs: v.ev.runs + extra.runs, failed: v.ev.failed + extra.failed };
      }
      verdict = judgeVariants(variants);
    }
    const failingSpec = verdict.failing.find((v) => !v.reference);
    let summary = summarise(axis, verdict, variants);
    if (this.control.rngSeed !== undefined && verdict.strength !== "none") summary += ` (with seed ${this.control.rngSeed} pinned)`;
    if (axis === "cpu" && verdict.strength !== "none") {
      const slow = variants.find((v) => !v.reference);
      summary += `; median test time ${isolated.medianMs ?? "?"} ms -> ${slow?.ev.medianMs ?? "?"} ms, which points at a hard-coded time budget or timeout`;
    }
    return {
      axis,
      strength: verdict.strength,
      summary,
      evidence: variants.map((v) => ({ ...v.ev, label: v.value })),
      ...(failingSpec && verdict.strength !== "none" ? { repro: this.adapter.reproCommand(specs.get(failingSpec.value)!) } : {}),
    };
  }

  private async parallelAxis(target: string): Promise<Finding> {
    this.opts.log(" parallel");
    const scope = this.opts.scope ?? this.adapter.defaultScope(target);
    const serialSpec: RunSpec = { tests: [target], env: {}, scope, workers: 1, ...this.control };
    const parSpec: RunSpec = { tests: [target], env: {}, scope, workers: this.opts.workers, ...this.control };
    const serial = await this.evidence(`${scope} with 1 worker`, serialSpec, target, this.opts.repeats);
    const par = await this.evidence(`${scope} with ${this.opts.workers} workers`, parSpec, target, this.opts.repeats);
    const variants: Variant[] = [
      { value: `1 worker over ${scope}`, ev: serial, reference: true },
      { value: `${this.opts.workers} workers over ${scope}`, ev: par },
    ];
    let verdict = judgeVariants(variants);
    if (verdict.strength === "deterministic" && this.opts.confirmRuns > 0) {
      const extra = await this.evidence(`${this.opts.workers} workers (confirm)`, parSpec, target, this.opts.confirmRuns);
      const extraSerial = await this.evidence("1 worker (confirm)", serialSpec, target, this.opts.confirmRuns);
      variants[1]!.ev = { ...par, runs: par.runs + extra.runs, failed: par.failed + extra.failed };
      variants[0]!.ev = { ...serial, runs: serial.runs + extraSerial.runs, failed: serial.failed + extraSerial.failed };
      verdict = judgeVariants(variants);
    }
    if (!verdict.failing.some((v) => !v.reference) && verdict.strength !== "elevated") {
      // Serial failing while parallel passes means parallelism hid a failure
      // (usually the order dependence), not that it caused one.
      return {
        axis: "parallel",
        strength: "none",
        summary: `running ${scope} with ${this.opts.workers} workers does not make it fail (${counts(variants[1]!.ev)} vs ${counts(variants[0]!.ev)} serially)`,
        evidence: variants.map((v) => ({ ...v.ev, label: v.value })),
      };
    }
    let summary = summarise("parallel", verdict, variants);
    if (verdict.strength !== "none" && verdict.failing.some((v) => !v.reference)) {
      summary = `fails when ${scope} is run with ${this.opts.workers} workers (${counts(variants[1]!.ev)}) but not serially (${counts(
        variants[0]!.ev,
      )}): shared state between concurrently running tests (files, ports, globals)`;
    }
    return {
      axis: "parallel",
      strength: verdict.strength,
      summary,
      evidence: variants.map((v) => ({ ...v.ev, label: v.value })),
      ...(verdict.strength !== "none" ? { repro: this.adapter.reproCommand(parSpec) } : {}),
    };
  }

  /** Does running `before` ahead of the target make it fail (or pass)? */
  private async probe(before: string[], target: string, wantFail: boolean): Promise<boolean> {
    const s = await this.sample({ tests: [...before, target], env: {} }, target, this.opts.repeats);
    const anyFail = s.some((x) => x.failed);
    const allFail = s.length > 0 && s.every((x) => x.failed);
    // Asymmetric on purpose: keeping a candidate set on weak evidence only
    // costs runs, discarding the real culprit ruins the search.
    return wantFail ? anyFail : !allFail && s.length > 0;
  }

  /** Narrow `candidates` to a single test that triggers the effect, if one exists. */
  private async isolate(candidates: string[], target: string, wantFail: boolean): Promise<string | undefined> {
    let pool = candidates;
    while (pool.length > 1) {
      const mid = Math.ceil(pool.length / 2);
      const left = pool.slice(0, mid);
      const right = pool.slice(mid);
      if (await this.probe(left, target, wantFail)) pool = left;
      else if (await this.probe(right, target, wantFail)) pool = right;
      else return undefined; // needs tests from both halves together
    }
    return pool[0];
  }

  private async orderAxis(target: string, neighbours: string[], isolated: Evidence, suite: Evidence): Promise<Finding> {
    this.opts.log(" order");
    const evidence: Evidence[] = [isolated, suite];
    const exact = this.caps.exactOrder;
    const others = neighbours.filter((t) => t !== target);
    const preceding = neighbours.slice(0, neighbours.indexOf(target));

    if (others.length === 0) return { axis: "order", strength: "none", summary: "only test in its file; order cannot matter", evidence };

    let shuffled: Evidence | undefined;
    if (this.caps.shuffle && this.opts.shuffles > 0) {
      let failed = 0;
      let runs = 0;
      for (let seed = 1; seed <= this.opts.shuffles; seed++) {
        const s = await this.sample({ tests: neighbours, env: {}, shuffleSeed: seed }, target, 1);
        runs += s.length;
        failed += s.filter((x) => x.failed).length;
      }
      shuffled = { label: `file in ${this.opts.shuffles} shuffled orders`, runs, failed };
      this.opts.log(`  ${shuffled.label}: ${counts(shuffled)} failed`);
      evidence.push(shuffled);
    }

    const passesAlone = isolated.failed === 0;
    const failsAlone = isolated.runs > 0 && isolated.failed === isolated.runs;
    let direction: "polluter" | "enabler" | undefined;
    let candidates: string[] = [];
    if (passesAlone && (suite.failed > 0 || (shuffled?.failed ?? 0) > 0)) {
      direction = "polluter";
      candidates = exact ? others : preceding;
    } else if (failsAlone && (suite.failed < suite.runs || (shuffled !== undefined && shuffled.failed < shuffled.runs))) {
      direction = "enabler";
      candidates = exact ? others : preceding;
    } else if (passesAlone && suite.failed === 0 && exact && others.length > preceding.length) {
      // Default order hides it; try every other test first.
      const allBefore = await this.evidence("after every other test in the file", { tests: [...others, target], env: {} }, target, this.opts.repeats);
      evidence.push(allBefore);
      if (allBefore.failed > 0) {
        direction = "polluter";
        candidates = others;
      }
    }

    if (!direction) {
      const strength = shuffled && shuffled.failed > 0 && passesAlone && suite.failed === 0 ? "elevated" : "none";
      return {
        axis: "order",
        strength,
        summary: strength === "none" ? "no effect from test order: same result alone and alongside its neighbours" : `fails in some shuffled orders (${counts(shuffled!)})`,
        evidence,
      };
    }

    const wantFail = direction === "polluter";
    const culprit = candidates.length > 0 ? await this.isolate(candidates, target, wantFail) : undefined;
    if (!culprit) {
      const what = wantFail ? "fails alongside its neighbours but passes alone" : "passes alongside its neighbours but fails alone";
      return {
        axis: "order",
        strength: "elevated",
        summary: `${what}; no single test is responsible (it takes a combination, or the culprit only runs after it in file order)`,
        evidence,
        repro: this.adapter.reproCommand({ tests: neighbours, env: {} }),
      };
    }

    const pairSpec: RunSpec = { tests: [culprit, target], env: {} };
    const after = await this.evidence(`right after ${culprit}`, pairSpec, target, this.opts.baselineRuns);
    evidence.push(after);
    let before: Evidence | undefined;
    if (exact) {
      before = await this.evidence(`right before ${culprit}`, { tests: [target, culprit], env: {} }, target, this.opts.baselineRuns);
      evidence.push(before);
    }
    const cleanAfter = wantFail ? after.failed === after.runs : after.failed === 0;
    const cleanBefore = before === undefined || (wantFail ? before.failed === 0 : before.failed === before.runs);
    const strength = cleanAfter && cleanBefore ? "deterministic" : "elevated";
    const summary = wantFail
      ? `fails only when run after ${culprit} (${counts(after)} right after it, ${counts(isolated)} alone${before ? `, ${counts(before)} when run before it` : ""}): that test leaves shared state behind`
      : `passes only when run after ${culprit} (${counts(after)} failed right after it, ${counts(isolated)} alone): it depends on setup that test does`;
    return { axis: "order", strength, summary, evidence, culprit, repro: this.adapter.reproCommand(pairSpec) };
  }
}
