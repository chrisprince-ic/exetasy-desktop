/**
 * Parse JSON from Gemini / other LLM responses.
 * Strips markdown fences, removes illegal control characters, and
 * repairs common LLM JSON mistakes (literal newlines, truncation).
 */
export function parseAiJson<T = unknown>(text: string): T {
  const attempts = [
    () => JSON.parse(normalizeAiJson(text)) as T,
    () => JSON.parse(escapeNewlinesInStrings(normalizeAiJson(text))) as T,
    () => JSON.parse(repairTruncatedJson(normalizeAiJson(text))) as T,
    () => JSON.parse(repairTruncatedJson(escapeNewlinesInStrings(normalizeAiJson(text)))) as T,
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch (err) {
      lastError = err;
    }
  }

  const message = lastError instanceof Error ? lastError.message : "Invalid JSON from AI";
  throw new Error(
    message.includes("Unterminated") || message.includes("Unexpected end")
      ? "AI response was truncated. Try fewer problems/questions or try again."
      : message,
  );
}

function normalizeAiJson(text: string): string {
  let cleaned = text.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  } else if (start !== -1) {
    cleaned = cleaned.slice(start);
  }

  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
  return cleaned;
}

function escapeNewlinesInStrings(json: string): string {
  return json.replace(/"(?:[^"\\]|\\.)*"/g, (match) =>
    match.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t"),
  );
}

/** Close strings/brackets when the model hits the output token limit mid-JSON. */
function repairTruncatedJson(json: string): string {
  let result = json.replace(/,\s*("[\w-]*)?:?\s*"?[^"]*$/, "");

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const ch of result) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  if (inString) result += '"';
  while (stack.length) result += stack.pop();
  return result;
}
