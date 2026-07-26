import type { GenerationAttempt, GenerationAttemptSummary } from "./types";

export const DEFAULT_GENERATION_ATTEMPT_PAGE_SIZE = 20;
export const MAX_GENERATION_ATTEMPT_PAGE_SIZE = 50;

export interface GenerationAttemptPagination {
  page: number;
  pageSize: number;
  offset: number;
}

function parsePositiveInteger(raw: string, field: string): number {
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${field} must be a positive integer.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${field} is too large.`);
  }
  return value;
}

/** Parse and bound the public audit-list pagination query. */
export function parseGenerationAttemptPagination(
  input: string | URL,
): GenerationAttemptPagination {
  const url = input instanceof URL ? input : new URL(input);
  const page = parsePositiveInteger(url.searchParams.get("page") ?? "1", "page");
  const pageSize = parsePositiveInteger(
    url.searchParams.get("pageSize") ?? String(DEFAULT_GENERATION_ATTEMPT_PAGE_SIZE),
    "pageSize",
  );
  if (pageSize > MAX_GENERATION_ATTEMPT_PAGE_SIZE) {
    throw new Error(`pageSize must be at most ${MAX_GENERATION_ATTEMPT_PAGE_SIZE}.`);
  }

  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) {
    throw new Error("Requested page is too large.");
  }
  return { page, pageSize, offset };
}

/** Strip all exact model input/output text from a list response. */
export function summarizeGenerationAttempt(
  attempt: GenerationAttempt,
): GenerationAttemptSummary {
  const { systemPrompt: _systemPrompt, userPrompt: _userPrompt, responseText: _responseText, ...summary } =
    attempt;
  return summary;
}
