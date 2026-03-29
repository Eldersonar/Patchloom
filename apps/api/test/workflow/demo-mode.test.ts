import { describe, expect, it } from "vitest";

import { seedDemoRuns } from "../../src/workflow/demo-mode";
import { InMemoryRunStore } from "../../src/workflow/run-store";

describe("demo mode", () => {
  it("seeds representative pull request review runs", () => {
    const runStore = new InMemoryRunStore({
      autoProgress: false
    });

    const runIds = seedDemoRuns(runStore);
    const runs = runStore.listRuns();

    expect(runIds).toHaveLength(2);
    expect(runs).toHaveLength(2);
    expect(runs.every((run) => run.status === "queued")).toBe(true);
    expect(runs.map((run) => run.repository)).toEqual([
      "acme/payments",
      "acme/platform"
    ]);

    runStore.dispose();
  });
});
