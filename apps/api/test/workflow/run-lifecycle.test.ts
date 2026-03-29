import { describe, expect, it } from "vitest";

import { InMemoryRunStore } from "../../src/workflow/run-store";

describe("run lifecycle transitions", () => {
  it("allows valid transitions and rejects invalid ones", () => {
    const runStore = new InMemoryRunStore({ autoProgress: false });
    const run = runStore.startPullRequestReview({
      pullRequestNumber: 7,
      pullRequestTitle: "Update billing checks",
      repository: "acme/payments"
    });

    expect(run.status).toBe("queued");

    const running = runStore.transitionRunStatus(run.id, "running");
    expect(running.status).toBe("running");

    const waiting = runStore.transitionRunStatus(run.id, "waiting_for_approval");
    expect(waiting.status).toBe("waiting_for_approval");

    const completed = runStore.transitionRunStatus(run.id, "completed");
    expect(completed.status).toBe("completed");

    expect(() => runStore.transitionRunStatus(run.id, "running")).toThrowError(
      /Invalid transition/
    );

    expect(() =>
      runStore.transitionRunStatus("missing-id", "running")
    ).toThrowError(/Run not found/);

    runStore.dispose();
  });
});
