export interface WorkflowLogEvent {
  error?: string;
  provider: string;
  runId: string;
  state: string;
  workflowType: string;
}

export interface WorkflowLogger {
  logRunEvent(event: WorkflowLogEvent): void;
}

/**
 * Logs workflow events as single-line JSON for ingestion by log pipelines.
 */
export class ConsoleWorkflowLogger implements WorkflowLogger {
  /**
   * Logs run lifecycle events with consistent fields.
   *
   * @param event - Workflow log payload.
   */
  public logRunEvent(event: WorkflowLogEvent): void {
    const payload = JSON.stringify({
      error: event.error,
      provider: event.provider,
      runId: event.runId,
      state: event.state,
      timestamp: new Date().toISOString(),
      workflowType: event.workflowType
    });

    if (event.error) {
      console.error(payload);
      return;
    }

    console.log(payload);
  }
}

/**
 * No-op workflow logger used by tests unless explicit assertions are needed.
 */
export class NullWorkflowLogger implements WorkflowLogger {
  /**
   * Ignores workflow log events.
   *
   * @param _event - Unused log event payload.
   */
  public logRunEvent(_event: WorkflowLogEvent): void {
    void _event;
  }
}
