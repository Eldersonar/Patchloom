import { randomUUID } from "node:crypto";

import type { Suggestion, WorkflowRun } from "@patchloom/core";

interface IndexedChangedFile {
  keywords: string[];
  lineHint?: number;
  path: string;
}

interface SuggestionCandidate {
  content: string;
  kind: Suggestion["kind"];
}

export interface EvidenceBackedSuggestionOutput {
  followUpTasks: string[];
  risks: string[];
  suggestedTests: string[];
  suggestions: Suggestion[];
}

/**
 * Creates empty artifact containers for a new workflow run.
 *
 * @returns Initial workflow artifacts.
 */
export function createInitialArtifacts(): WorkflowRun["artifacts"] {
  return {
    normalizedOutput: {
      confidence: 0,
      followUpTasks: [],
      risks: [],
      suggestedTests: [],
      summary: ""
    },
    rawModelResponses: {
      followUpTasks: "",
      risks: "",
      suggestedTests: "",
      summary: ""
    }
  };
}

/**
 * Builds suggestion entities from normalized workflow output fields.
 *
 * @param run - Workflow run with normalized output fields.
 * @param createdAt - Suggestion creation timestamp.
 * @returns Suggestion entities for risk/test/follow-up items.
 */
export function createSuggestionsFromWorkflowOutput(
  run: Pick<WorkflowRun, "followUpTasks" | "risks" | "suggestedTests">,
  createdAt: string,
  changedFiles?: string[]
): EvidenceBackedSuggestionOutput {
  const indexedFiles = indexChangedFiles(changedFiles);
  const hasEvidenceContext = indexedFiles.length > 0;
  const suggestionCandidates: SuggestionCandidate[] = [
    ...run.risks.map((content) => ({ content, kind: "risk" as const })),
    ...run.suggestedTests.map((content) => ({ content, kind: "test" as const })),
    ...run.followUpTasks.map((content) => ({ content, kind: "follow_up" as const }))
  ];

  const suggestions = suggestionCandidates
    .map((candidate) => {
      const sourceRefs = hasEvidenceContext
        ? matchSuggestionEvidence(candidate.content, indexedFiles)
        : [];

      return {
        content: candidate.content,
        createdAt,
        id: randomUUID(),
        kind: candidate.kind,
        sourceRefs
      } satisfies Suggestion;
    })
    .filter((suggestion) => !hasEvidenceContext || suggestion.sourceRefs.length > 0);

  return {
    followUpTasks: suggestions
      .filter((suggestion) => suggestion.kind === "follow_up")
      .map((suggestion) => suggestion.content),
    risks: suggestions
      .filter((suggestion) => suggestion.kind === "risk")
      .map((suggestion) => suggestion.content),
    suggestedTests: suggestions
      .filter((suggestion) => suggestion.kind === "test")
      .map((suggestion) => suggestion.content),
    suggestions
  };
}

/**
 * Converts unknown workflow errors into user-facing run failure messages.
 *
 * @param error - Unknown error value.
 * @returns User-facing failure reason.
 */
export function toFailureReason(error: unknown): string {
  if (isZodLikeError(error)) {
    return formatZodLikeError(error);
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return "Workflow execution failed.";
}

/**
 * Emits a single-line structured log event for workflow execution.
 *
 * @param event - Event name.
 * @param payload - Event fields.
 */
export function logRunEvent(
  event: string,
  payload: Record<string, unknown>
): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return;
  }

  console.log(
    JSON.stringify({
      event,
      scope: "workflow_run",
      timestamp: new Date().toISOString(),
      ...payload
    })
  );
}

/**
 * Serializes unknown errors for structured log output.
 *
 * @param error - Unknown error value.
 * @returns Serializable error payload.
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack
    };
  }

  return {
    value: String(error)
  };
}

interface ZodLikeIssue {
  message?: unknown;
  path?: unknown;
}

interface ZodLikeErrorShape {
  issues?: unknown;
  name?: unknown;
}

/**
 * Detects zod-style validation errors by shape.
 *
 * @param error - Unknown error value.
 * @returns True when error matches zod-like structure.
 */
function isZodLikeError(error: unknown): error is ZodLikeErrorShape {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as ZodLikeErrorShape;

  return (
    candidate.name === "ZodError" && Array.isArray(candidate.issues)
  );
}

/**
 * Formats zod-style validation errors into concise user-facing messages.
 *
 * @param error - Zod-like error shape.
 * @returns Concise validation failure reason.
 */
function formatZodLikeError(error: ZodLikeErrorShape): string {
  const issues = (error.issues as ZodLikeIssue[]).filter(
    (issue) => issue && typeof issue === "object"
  );

  if (issues.length === 0) {
    return "Model output validation failed.";
  }

  const firstIssue = issues[0];
  const firstMessage = asNonEmptyString(firstIssue.message) ?? "Invalid output.";
  const firstPath = formatIssuePath(firstIssue.path);
  const suffix = issues.length > 1 ? ` (+${issues.length - 1} more issues)` : "";

  if (!firstPath) {
    return `Model output validation failed: ${firstMessage}${suffix}`;
  }

  return `Model output validation failed at ${firstPath}: ${firstMessage}${suffix}`;
}

/**
 * Formats zod issue paths into dot notation.
 *
 * @param path - Unknown issue path value.
 * @returns Dot-notation path or null when unavailable.
 */
function formatIssuePath(path: unknown): string | null {
  if (!Array.isArray(path) || path.length === 0) {
    return null;
  }

  return path
    .map((segment) => String(segment))
    .filter((segment) => segment.length > 0)
    .join(".");
}

/**
 * Returns trimmed non-empty string values.
 *
 * @param value - Unknown value.
 * @returns Trimmed string or null when not available.
 */
function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Builds parsed evidence index for changed files.
 *
 * @param changedFiles - Raw changed-file entries.
 * @returns Parsed changed-file metadata for matching.
 */
function indexChangedFiles(changedFiles: string[] | undefined): IndexedChangedFile[] {
  return (changedFiles ?? [])
    .map((entry) => parseChangedFileEntry(entry))
    .filter((entry): entry is IndexedChangedFile => Boolean(entry));
}

/**
 * Parses a formatted changed-file string into searchable evidence metadata.
 *
 * @param entry - Formatted changed file string.
 * @returns Indexed changed-file metadata or null when parsing fails.
 */
function parseChangedFileEntry(entry: string): IndexedChangedFile | null {
  const normalized = entry.trim();

  if (!normalized) {
    return null;
  }

  const pathMatch = normalized.match(/^([^:\s][^:(]*?)(?:\s+\([^)]*\))?(?::\s+.*)?$/);
  const path = pathMatch?.[1]?.trim() ?? "";

  if (!path) {
    return null;
  }

  const lineHint = parsePatchLineHint(normalized);
  const keywords = extractKeywords(`${path} ${normalized}`);

  if (keywords.length === 0) {
    return null;
  }

  return {
    keywords,
    lineHint,
    path
  };
}

/**
 * Extracts changed-side hunk line hints from unified diff snippets.
 *
 * @param value - Changed-file entry with optional patch hunk.
 * @returns Suggested changed-side line hint when present.
 */
function parsePatchLineHint(value: string): number | undefined {
  const hunkMatch = value.match(/@@\s*-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@/);

  if (!hunkMatch?.[1]) {
    return undefined;
  }

  const parsed = Number.parseInt(hunkMatch[1], 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Matches suggestion text to changed files via keyword overlap.
 *
 * @param content - Suggestion content.
 * @param indexedFiles - Indexed changed-file metadata.
 * @returns Ranked source refs tied to changed files.
 */
function matchSuggestionEvidence(
  content: string,
  indexedFiles: IndexedChangedFile[]
): Suggestion["sourceRefs"] {
  const contentKeywords = extractKeywords(content);

  if (contentKeywords.length === 0) {
    return [];
  }

  const scored = indexedFiles
    .map((entry) => ({
      lineHint: entry.lineHint,
      path: entry.path,
      score: overlapScore(contentKeywords, entry.keywords)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

  if (scored.length === 0) {
    return [];
  }

  return scored.slice(0, 2).map((entry) => ({
    lineHint: entry.lineHint,
    path: entry.path
  }));
}

/**
 * Calculates overlap score between suggestion and changed-file keywords.
 *
 * @param contentKeywords - Suggestion keywords.
 * @param fileKeywords - Changed-file keywords.
 * @returns Positive overlap score.
 */
function overlapScore(contentKeywords: string[], fileKeywords: string[]): number {
  const fileSet = new Set(fileKeywords);
  let score = 0;

  for (const keyword of contentKeywords) {
    if (fileSet.has(keyword)) {
      score += 1;
    }
  }

  return score;
}

/**
 * Converts arbitrary text into deduplicated searchable keywords.
 *
 * @param input - Raw text value.
 * @returns Normalized keyword list.
 */
function extractKeywords(input: string): string[] {
  const normalized = input
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized) {
    return [];
  }

  const stopWords = new Set([
    "add",
    "after",
    "all",
    "and",
    "are",
    "can",
    "check",
    "cover",
    "create",
    "data",
    "edge",
    "file",
    "flow",
    "for",
    "from",
    "handling",
    "in",
    "into",
    "issue",
    "its",
    "may",
    "new",
    "of",
    "on",
    "or",
    "path",
    "review",
    "risk",
    "session",
    "task",
    "test",
    "that",
    "the",
    "this",
    "to",
    "update",
    "with"
  ]);

  const deduped = new Set<string>();

  for (const token of normalized.split(/\s+/)) {
    if (token.length < 3 || /^\d+$/.test(token) || stopWords.has(token)) {
      continue;
    }

    const normalizedToken = normalizeToken(token);

    if (normalizedToken.length >= 3 && !stopWords.has(normalizedToken)) {
      deduped.add(normalizedToken);
    }
  }

  return [...deduped];
}

/**
 * Applies lightweight stemming to improve token overlap.
 *
 * @param token - Raw token.
 * @returns Normalized token.
 */
function normalizeToken(token: string): string {
  if (token.length > 6 && token.endsWith("ing")) {
    return token.slice(0, -3);
  }

  if (token.length > 5 && token.endsWith("ed")) {
    return token.slice(0, -2);
  }

  if (token.length > 4 && token.endsWith("es")) {
    return token.slice(0, -2);
  }

  if (token.length > 4 && token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
}
