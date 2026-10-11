import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Directory holding python/ and runtime/. Found next to the bundled
 * dist/flipfactor.cjs (or an installed package); under the test runner,
 * where __dirname is not defined, it falls back to the working directory.
 */
export function resourceDir(): string {
  const starts = [process.env.FLIPFACTOR_HOME, typeof __dirname === "string" ? __dirname : undefined, process.cwd()];
  for (const start of starts) {
    if (!start) continue;
    for (const candidate of [path.resolve(start), path.resolve(start, ".."), path.resolve(start, "../..")]) {
      if (existsSync(path.join(candidate, "runtime", "jest-setup.cjs"))) return candidate;
    }
  }
  throw new Error("flipfactor resources (python/, runtime/) not found; set FLIPFACTOR_HOME");
}
