import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createBackend } from "./index.js";

describe("createBackend", () => {
  it("creates the git-native backend when configured", () => {
    const directory = mkdtempSync(join(tmpdir(), "tasksmd-backend-"));
    try {
      const backend = createBackend(
        { backend: "git-native", label: "tasks.md" },
        directory,
      );

      expect(backend.name).toBe("git-native");
      expect(backend.capabilities).toMatchObject({
        claims: "collision-free",
        sourceOfTruth: "log",
        generatedSnapshot: true,
        supportsLeases: true,
        humanEditableSnapshot: false,
      });
      expect(backend.capabilities.operations.render).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
