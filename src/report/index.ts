import type { Evidence, Finding, Report, TestDiagnosis } from "../types.js";

const LABEL: Record<TestDiagnosis["classification"], string> = {
  flaky: "FLAKY",
  "environment-dependent": "ENVIRONMENT-DEPENDENT",
  broken: "BROKEN",
  "flaky-unexplained": "FLAKY, CAUSE NOT FOUND",
  "not-reproduced": "NOT REPRODUCED",
};

const real = (f: Finding) => f.strength === "deterministic" || f.strength === "elevated";

function ev(e: Evidence): string {
  return `${e.failed}/${e.runs} failed${e.medianMs !== undefined ? `, median ${e.medianMs} ms` : ""}`;
}

export function toJson(report: Report): string {
  return JSON.stringify(report, null, 2) + "\n";
}

export function toText(report: Report): string {
  const lines: string[] = [];
  lines.push(`flipfactor ${report.version} · ${report.runner} · ${report.totalRuns} runs · ${(report.wallMs / 1000).toFixed(1)} s`);
  lines.push(`inherited TZ ${report.inherited.tz}, locale ${report.inherited.locale}`);
  for (const t of report.tests) {
    lines.push("");
    lines.push(`${LABEL[t.classification]}  ${t.id}`);
    lines.push(`  ${t.headline}`);
    lines.push(`  baseline: alone ${ev(t.baseline.isolated)}; with its neighbours ${ev(t.baseline.suite)}`);
    for (const f of t.findings.filter(real)) {
      lines.push(`  [${f.axis}] ${f.strength}: ${f.summary}`);
      for (const e of f.evidence) lines.push(`      ${e.label.padEnd(44)} ${ev(e)}`);
      if (f.repro) lines.push(`      repro: ${f.repro}`);
    }
    const quiet = t.findings.filter((f) => f.strength === "none").map((f) => f.axis);
    const skipped = t.findings.filter((f) => f.strength === "skipped");
    if (quiet.length) lines.push(`  no effect: ${quiet.join(", ")}`);
    for (const s of skipped) lines.push(`  skipped ${s.axis}: ${s.summary}`);
    lines.push(`  ${t.runs} runs`);
  }
  return lines.join("\n") + "\n";
}

function mdEscape(s: string): string {
  return s.replace(/\|/g, "\\|");
}

export const COMMENT_MARKER = "<!-- flipfactor-report -->";

export function toMarkdown(report: Report): string {
  const out: string[] = [COMMENT_MARKER, "## flipfactor: why is it flaky?", ""];
  out.push("| Test | Verdict | Why |", "| --- | --- | --- |");
  for (const t of report.tests) out.push(`| \`${mdEscape(t.id)}\` | ${LABEL[t.classification]} | ${mdEscape(t.headline)} |`);
  for (const t of report.tests) {
    out.push("", `<details><summary><code>${t.id}</code>: ${LABEL[t.classification].toLowerCase()}</summary>`, "");
    out.push(`Baseline: alone ${ev(t.baseline.isolated)}; with its neighbours ${ev(t.baseline.suite)}.`, "");
    const shown = t.findings.filter(real);
    for (const f of shown) {
      out.push(`**${f.axis}** (${f.strength}): ${f.summary}`, "", "| Condition | Failed |", "| --- | --- |");
      for (const e of f.evidence) out.push(`| ${mdEscape(e.label)} | ${e.failed}/${e.runs} |`);
      if (f.repro) out.push("", "```sh", f.repro, "```");
      out.push("");
    }
    const quiet = t.findings.filter((f) => f.strength === "none").map((f) => f.axis);
    if (quiet.length) out.push(`No effect: ${quiet.join(", ")}.`);
    const skipped = t.findings.filter((f) => f.strength === "skipped");
    if (skipped.length) out.push(`Skipped: ${skipped.map((s) => `${s.axis} (${s.summary})`).join("; ")}.`);
    out.push("", "</details>");
  }
  out.push("", `<sub>${report.totalRuns} runs in ${(report.wallMs / 1000).toFixed(0)} s with ${report.runner}, inherited TZ ${report.inherited.tz}. flipfactor ${report.version}</sub>`, "");
  return out.join("\n");
}
