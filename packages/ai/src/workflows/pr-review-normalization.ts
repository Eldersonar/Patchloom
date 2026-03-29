export interface RefineGeneratedItemsOptions {
  maxItems: number;
  maxLength: number;
}

/**
 * Refines generated list items to reduce noise and improve readability.
 *
 * @param items - Raw generated items.
 * @param options - Item count and length limits.
 * @returns Refined item list.
 */
export function refineGeneratedItems(
  items: string[],
  options: RefineGeneratedItemsOptions
): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const rawItem of items) {
    const normalized = normalizeItem(rawItem, options.maxLength);

    if (!normalized) {
      continue;
    }

    const key = toDedupKey(normalized);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(normalized);

    if (deduped.length >= options.maxItems) {
      break;
    }
  }

  return deduped;
}

/**
 * Refines model summary text for dashboard readability.
 *
 * @param summary - Raw model summary.
 * @returns Refined summary limited to first sentences and max length.
 */
export function refineSummary(summary: string): string {
  const compact = summary.replace(/\s+/g, " ").trim();

  if (!compact) {
    return "";
  }

  const sentenceParts = compact
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const limitedSentences = sentenceParts.slice(0, 3).join(" ");

  if (limitedSentences.length <= 520) {
    return limitedSentences;
  }

  return `${limitedSentences.slice(0, 517)}...`;
}

function normalizeItem(item: string, maxLength: number): string | null {
  const withoutPrefix = item
    .replace(/^\s*[-*]\s+/, "")
    .replace(/^\s*\d+[.)]\s+/, "");
  const compact = withoutPrefix.replace(/\s+/g, " ").trim();

  if (compact.length < 12) {
    return null;
  }

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3).trim()}...`;
}

function toDedupKey(item: string): string {
  return item.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
