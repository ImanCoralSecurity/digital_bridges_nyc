import assert from "node:assert/strict";
import { test } from "node:test";

const { parseInlineMarkdown } = await import("../lib/inlineMarkdown.ts");

test("parses bold and italic emphasis without changing surrounding text", () => {
  assert.deepEqual(parseInlineMarkdown("This is **important** and *personal*."), [
    { type: "text", text: "This is " },
    { type: "strong", text: "important" },
    { type: "text", text: " and " },
    { type: "emphasis", text: "personal" },
    { type: "text", text: "." },
  ]);
});

test("leaves unmatched and empty emphasis markers visible", () => {
  assert.deepEqual(parseInlineMarkdown("Keep **unfinished"), [
    { type: "text", text: "Keep **unfinished" },
  ]);
  assert.deepEqual(parseInlineMarkdown("Keep **** markers"), [
    { type: "text", text: "Keep **** markers" },
  ]);
});

test("leaves ordinary asterisks alone", () => {
  assert.deepEqual(parseInlineMarkdown("The total is 2 * 3, not a style marker."), [
    { type: "text", text: "The total is 2 * 3, not a style marker." },
  ]);
});

test("does not treat emphasis across line breaks as markdown", () => {
  assert.deepEqual(parseInlineMarkdown("**first line\nsecond line**"), [
    { type: "text", text: "**first line\nsecond line**" },
  ]);
});

test("keeps HTML-looking input as inert text tokens", () => {
  assert.deepEqual(parseInlineMarkdown("**<script>alert(1)</script>**"), [
    { type: "strong", text: "<script>alert(1)</script>" },
  ]);
});

test("parses the reported participant-name regression", () => {
  assert.deepEqual(
    parseInlineMarkdown("My name is **Amina Rahman** and I value **hospitality**."),
    [
      { type: "text", text: "My name is " },
      { type: "strong", text: "Amina Rahman" },
      { type: "text", text: " and I value " },
      { type: "strong", text: "hospitality" },
      { type: "text", text: "." },
    ],
  );
});
