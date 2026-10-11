import { existsSync } from "node:fs";
import path from "node:path";
import { parseJestJson } from "./adapters/jest.js";
import type { RunnerName } from "./types.js";

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]!] = decode(m[2]!);
  return out;
}

/** Map a pytest JUnit classname (tests.test_x.TestCls) + name to a node id. */
export function pytestNodeId(classname: string, name: string, cwd: string): string {
  const parts = classname.split(".");
  for (let k = parts.length; k >= 1; k--) {
    const file = `${parts.slice(0, k).join("/")}.py`;
    if (existsSync(path.join(cwd, file))) return [file, ...parts.slice(k), name].join("::");
  }
  return [`${parts.join("/")}.py`, name].join("::");
}

/** Failed test ids from a pytest JUnit XML report. */
export function failedFromJUnit(xml: string, cwd: string): string[] {
  const ids: string[] = [];
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const body = m[2] ?? "";
    if (!/<(failure|error)\b/.test(body)) continue;
    const a = attrs(m[1] ?? "");
    if (!a.name) continue;
    ids.push(pytestNodeId(a.classname ?? "", a.name, cwd));
  }
  return [...new Set(ids)];
}

/** Failed test ids from a Jest --json report. */
export function failedFromJestJson(text: string, cwd: string): string[] {
  const parsed = parseJestJson(JSON.parse(text), cwd);
  return [...parsed.entries()].filter(([id, o]) => o.outcome === "fail" && !id.endsWith("::*")).map(([id]) => id);
}

export function failedFromReport(text: string, runner: RunnerName, cwd: string): string[] {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<")) {
    if (runner !== "pytest") throw new Error("JUnit XML input is supported for pytest; for Jest pass its --json output");
    return failedFromJUnit(text, cwd);
  }
  if (runner !== "jest") throw new Error("JSON input is Jest's --json output; for pytest pass --junitxml output");
  return failedFromJestJson(text, cwd);
}
