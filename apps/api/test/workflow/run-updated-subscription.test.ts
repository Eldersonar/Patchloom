import { describe, expect, it } from "vitest";

import { createGraphQLSchema } from "../../src/server";
import { InMemoryRunStore } from "../../src/workflow/run-store";

describe("runUpdated subscription", () => {
  it("emits run updates and exposes subscription field", async () => {
    const runStore = new InMemoryRunStore({ autoProgress: false });
    const iterator = runStore.subscribeRunUpdates();

    const schema = createGraphQLSchema("0.1.0-test", runStore);
    const subscriptionFields =
      schema.getSubscriptionType()?.getFields() ?? {};

    expect(Object.keys(subscriptionFields)).toContain("runUpdated");

    const firstNext = iterator.next();
    const run = runStore.startPullRequestReview({
      pullRequestNumber: 99,
      pullRequestTitle: "Improve retry logic",
      repository: "acme/service"
    });
    const firstEvent = await firstNext;

    expect(firstEvent.done).toBe(false);

    if (firstEvent.done) {
      throw new Error("Expected first runUpdated event");
    }

    expect(firstEvent.value.runUpdated.id).toBe(run.id);
    expect(firstEvent.value.runUpdated.status).toBe("queued");

    const secondNext = iterator.next();
    runStore.transitionRunStatus(run.id, "running");
    const secondEvent = await secondNext;

    expect(secondEvent.done).toBe(false);

    if (secondEvent.done) {
      throw new Error("Expected second runUpdated event");
    }

    expect(secondEvent.value.runUpdated.status).toBe("running");

    await iterator.return?.();
    runStore.dispose();
  });
});
