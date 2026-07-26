import type {
  SemanticValidationAttempt,
  SemanticValidationAttemptSummary,
} from "./types";

export const DEFAULT_SEMANTIC_VALIDATION_PAGE_SIZE = 20;
export const MAX_SEMANTIC_VALIDATION_PAGE_SIZE = 50;

export interface SemanticValidationPagination {
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

/** Parse and bound the validator-audit list pagination query. */
export function parseSemanticValidationPagination(
  input: string | URL,
): SemanticValidationPagination {
  const url = input instanceof URL ? input : new URL(input);
  const page = parsePositiveInteger(url.searchParams.get("page") ?? "1", "page");
  const pageSize = parsePositiveInteger(
    url.searchParams.get("pageSize") ?? String(DEFAULT_SEMANTIC_VALIDATION_PAGE_SIZE),
    "pageSize",
  );
  if (pageSize > MAX_SEMANTIC_VALIDATION_PAGE_SIZE) {
    throw new Error(`pageSize must be at most ${MAX_SEMANTIC_VALIDATION_PAGE_SIZE}.`);
  }

  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) {
    throw new Error("Requested page is too large.");
  }
  return { page, pageSize, offset };
}

/** Strip exact validator input/output text from the list read model. */
export function summarizeSemanticValidationAttempt(
  attempt: SemanticValidationAttempt,
): SemanticValidationAttemptSummary {
  const {
    systemPrompt: _systemPrompt,
    userPrompt: _userPrompt,
    candidateText: _candidateText,
    rawResponse: _rawResponse,
    ...summary
  } = attempt;
  return summary;
}
