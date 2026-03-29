CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY,
  workflow_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'queued',
      'running',
      'waiting_for_approval',
      'completed',
      'failed',
      'cancelled'
    )
  ),
  repository TEXT NOT NULL,
  pull_request_number INTEGER NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suggestions (
  id UUID PRIMARY KEY,
  workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('summary', 'risk', 'test', 'follow_up')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_repository
  ON workflow_runs(repository);

CREATE INDEX IF NOT EXISTS idx_suggestions_workflow_run_id
  ON suggestions(workflow_run_id);
