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
- `failure_reason` text nullable (terminal failure message when run status is `failed`)
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
Represents a human approval or rejection decision for a suggestion.

Fields:
- `id` UUID primary key
- `run_id` UUID reference to workflow run
- `suggestion_id` UUID reference to suggestion
- `actor` text (who approved/rejected)
- `decision` text (`approved` or `rejected`)
- `created_at` timestamptz

## CommentPublication
Represents a publish action for approved suggestions.

Fields:
- `id` UUID primary key
- `run_id` UUID reference to workflow run
- `idempotency_key` text unique per run publication attempt
- `target` text (publication target URL/resource)
- `body` text (published comment body)
- `comment_id` text (GitHub comment identifier)
- `published_url` text (GitHub comment URL)
- `created_at` timestamptz
