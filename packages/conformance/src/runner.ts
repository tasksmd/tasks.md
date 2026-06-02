// The reusable runner. A real backend imports `runConformance`, passes a
// `ConformanceTarget`, and asserts the report has no failures. Framework-free:
// it returns a plain report so callers can assert it in any test runner.

import { checks } from "./checks.js";
import type {
  CheckResult,
  ConformanceReport,
  ConformanceTarget,
  ConformanceWorld,
} from "./types.js";

async function dispose(world: ConformanceWorld): Promise<void> {
  await world.dispose?.();
}

export async function runConformance(
  target: ConformanceTarget,
): Promise<ConformanceReport> {
  const results: CheckResult[] = [];
  for (const check of checks) {
    const missing = check.requires.filter(
      (capability) => !target.capabilities[capability],
    );
    if (missing.length > 0) {
      results.push({
        name: check.name,
        status: "skip",
        reason: `requires ${missing.join(", ")}`,
      });
      continue;
    }
    const world = await target.createWorld();
    try {
      await check.run(world);
      results.push({ name: check.name, status: "pass" });
    } catch (error) {
      results.push({
        name: check.name,
        status: "fail",
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await dispose(world);
    }
  }
  return { target: target.name, results };
}

export { checks } from "./checks.js";
