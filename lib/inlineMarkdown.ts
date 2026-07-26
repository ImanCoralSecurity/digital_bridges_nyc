export type InlineMarkdownToken = {
  type: "text" | "strong" | "emphasis";
  text: string;
};

function appendText(tokens: InlineMarkdownToken[], text: string): void {
  if (!text) return;

  const previous = tokens.at(-1);
  if (previous?.type === "text") {
    previous.text += text;
    return;
  }

  tokens.push({ type: "text", text });
}

function findClosingMarker(text: string, marker: "**" | "*", from: number): number {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === "\n") return -1;
    if (text[index] !== "*") continue;

    if (marker === "**" && text.startsWith("**", index)) return index;
    if (
      marker === "*" &&
      text[index - 1] !== "*" &&
      text[index + 1] !== "*"
    ) {
      return index;
    }
  }

  return -1;
}

/**
 * Parse only the inline emphasis emitted by dialogue models. Everything else,
 * including HTML-looking input and unmatched markers, remains ordinary text.
 */
export function parseInlineMarkdown(text: string): InlineMarkdownToken[] {
  const tokens: InlineMarkdownToken[] = [];
  let plainTextStart = 0;
  let index = 0;

  while (index < text.length) {
    if (text[index] !== "*") {
      index += 1;
      continue;
    }

    const marker: "**" | "*" = text.startsWith("**", index) ? "**" : "*";
    const contentStart = index + marker.length;
    const closingIndex = findClosingMarker(text, marker, contentStart);
    const content = closingIndex >= 0 ? text.slice(contentStart, closingIndex) : "";

    if (closingIndex < 0 || content.trim().length === 0) {
      index += marker.length;
      continue;
    }

    appendText(tokens, text.slice(plainTextStart, index));
    tokens.push({
      type: marker === "**" ? "strong" : "emphasis",
      text: content,
    });

    index = closingIndex + marker.length;
    plainTextStart = index;
  }

  appendText(tokens, text.slice(plainTextStart));
  return tokens;
}
