# Domain Model

## WorkflowRun
Represents one workflow execution.

Fields:
- `id` UUID primary key
- `workflow_type` text (`pr_summary` for current MVP)
- `status` text (`queued`, `running`, `waiting_for_approval`, `completed`, `failed`, `cancelled`)
- `repository` text
- `pull_request_number` integer
- `summary` text
- `created_at` timestamptz
- `updated_at` timestamptz

## Suggestion
Represents one structured recommendation produced by a run.

Fields:
- `id` UUID primary key
- `workflow_run_id` UUID foreign key to `workflow_runs.id`
- `kind` text (`summary`, `risk`, `test`, `follow_up`)
- `content` text
- `created_at` timestamptz

## ApprovalDecision
Planned for next phase.

## CommentPublication
Planned for next phase.
