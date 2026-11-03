/**
 * Local, zero-cost context selection.
 *
 * The naive approach — paste 60k characters of course notes into every
 * request — is what burns a student's plan. A 30-question exam runs three
 * batches, so the same 60k gets sent three times: ~45k tokens for one exam.
 *
 * Instead we chunk the material once, then use BM25 to pick only the passages
 * relevant to each batch's topics. BM25 is pure arithmetic over a word index:
 * no model, no API, no embeddings, nothing to pay for. Typical result is
 * 10-15k characters per request instead of 60k.
 */

export interface Chunk {
  id: number;
  /** Which material it came from, so prompts can cite a source. */
  source: string;
  text: string;
  /** Term frequencies, precomputed once. */
  tf: Map<string, number>;
  length: number;
}

/* ------------------------------ tokenising ------------------------------ */

// Short, high-frequency words carry no signal for retrieval and only inflate
// the index. This is deliberately small — domain words must survive.
const STOPWORDS = new Set(
  ("a an and are as at be been but by for from has have how i if in into is it its of on or " +
    "that the their then there these they this to was were what when where which who will with " +
    "you your we our can could should would may might must do does did not no nor so such than " +
    "too very s t just also about above after again all any because before being below between " +
    "both during each few further here more most other over own same some only once")
    .split(" "),
);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && w.length < 30 && !STOPWORDS.has(w));
}

/* ------------------------------- chunking ------------------------------- */

const TARGET_CHUNK = 900;
const MAX_CHUNK = 1400;

/**
 * Splits text into retrieval-sized pieces on paragraph boundaries, falling
 * back to sentences when a paragraph is oversized. Keeping chunks whole-ish
 * matters: a question generated from half a definition is a bad question.
 */
export function chunkText(source: string, text: string, startId = 0): Chunk[] {
  const chunks: Chunk[] = [];
  let id = startId;

  const push = (body: string) => {
    const trimmed = body.trim();
    if (trimmed.length < 60) return; // too small to be worth a slot
    chunks.push({
      id: id++,
      source,
      text: trimmed,
      tf: termFrequencies(trimmed),
      length: trimmed.length,
    });
  };

  let buffer = "";
  for (const para of text.split(/\n\s*\n/)) {
    const block = para.trim();
    if (!block) continue;

    if (block.length > MAX_CHUNK) {
      if (buffer) {
        push(buffer);
        buffer = "";
      }
      // Oversized block: break on sentence ends.
      let sentenceBuf = "";
      for (const sentence of block.split(/(?<=[.!?])\s+/)) {
        if (sentenceBuf.length + sentence.length > TARGET_CHUNK) {
          push(sentenceBuf);
          sentenceBuf = sentence;
        } else {
          sentenceBuf += (sentenceBuf ? " " : "") + sentence;
        }
      }
      push(sentenceBuf);
      continue;
    }

    if (buffer.length + block.length > TARGET_CHUNK) {
      push(buffer);
      buffer = block;
    } else {
      buffer += (buffer ? "\n\n" : "") + block;
    }
  }
  push(buffer);

  return chunks;
}

function termFrequencies(text: string): Map<string, number> {
  const tf = new Map<string, number>();
  for (const term of tokenize(text)) tf.set(term, (tf.get(term) ?? 0) + 1);
  return tf;
}

/* --------------------------------- BM25 --------------------------------- */

const K1 = 1.5;
const B = 0.75;

export class ChunkIndex {
  private readonly chunks: Chunk[];
  private readonly df = new Map<string, number>();
  private readonly avgLength: number;

  constructor(chunks: Chunk[]) {
    this.chunks = chunks;
    for (const chunk of chunks) {
      for (const term of chunk.tf.keys()) this.df.set(term, (this.df.get(term) ?? 0) + 1);
    }
    this.avgLength = chunks.length
      ? chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length
      : 1;
  }

  get size(): number {
    return this.chunks.length;
  }

  get totalChars(): number {
    return this.chunks.reduce((sum, c) => sum + c.length, 0);
  }

  private idf(term: string): number {
    const n = this.chunks.length;
    const df = this.df.get(term) ?? 0;
    // Standard BM25 idf, floored so very common terms can't go negative.
    return Math.max(0.01, Math.log(1 + (n - df + 0.5) / (df + 0.5)));
  }

  score(chunk: Chunk, queryTerms: string[]): number {
    let score = 0;
    for (const term of queryTerms) {
      const f = chunk.tf.get(term);
      if (!f) continue;
      const norm = 1 - B + B * (chunk.length / this.avgLength);
      score += this.idf(term) * ((f * (K1 + 1)) / (f + K1 * norm));
    }
    return score;
  }

  /**
   * Picks the highest-scoring chunks that fit inside `charBudget`.
   *
   * `exclude` lets successive batches avoid re-sending passages an earlier
   * batch already used, which both saves tokens and stops the model writing
   * the same question twice.
   */
  select(
    query: string,
    charBudget: number,
    exclude: ReadonlySet<number> = new Set(),
  ): { chunks: Chunk[]; chars: number } {
    const terms = tokenize(query);
    const candidates = this.chunks.filter((c) => !exclude.has(c.id));

    // With no usable query terms, fall back to document order rather than
    // returning nothing — a generic exam beats a failed one.
    const ranked = terms.length
      ? candidates
          .map((chunk) => ({ chunk, score: this.score(chunk, terms) }))
          .filter((r) => r.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((r) => r.chunk)
      : candidates;

    const picked: Chunk[] = [];
    let chars = 0;
    for (const chunk of ranked) {
      if (chars + chunk.length > charBudget) continue;
      picked.push(chunk);
      chars += chunk.length;
      if (chars >= charBudget * 0.92) break;
    }

    // Nothing matched well enough: take the opening of the material so the
    // model still has something concrete to work from.
    if (picked.length === 0) {
      for (const chunk of candidates) {
        if (chars + chunk.length > charBudget) break;
        picked.push(chunk);
        chars += chunk.length;
      }
    }

    // Restore document order so the excerpt reads naturally.
    picked.sort((a, b) => a.id - b.id);
    return { chunks: picked, chars };
  }
}

/** Builds an index over several materials at once. */
export function buildIndex(materials: Array<{ title: string; text: string }>): ChunkIndex {
  const chunks: Chunk[] = [];
  for (const m of materials) {
    chunks.push(...chunkText(m.title, m.text, chunks.length));
  }
  return new ChunkIndex(chunks);
}

/** Renders selected chunks into a prompt block with source attribution. */
export function renderChunks(chunks: Chunk[]): string {
  const bySource = new Map<string, string[]>();
  for (const chunk of chunks) {
    const list = bySource.get(chunk.source) ?? [];
    list.push(chunk.text);
    bySource.set(chunk.source, list);
  }
  return [...bySource.entries()]
    .map(([source, parts]) => `### ${source}\n\n${parts.join("\n\n")}`)
    .join("\n\n");
}
