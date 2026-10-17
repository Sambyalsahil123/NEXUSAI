import { describe, expect, it } from "vitest";
import { EMBEDDING_DIMENSIONS, LocalEmbeddingService } from "../src/services/embedding.service.js";

describe("LocalEmbeddingService", () => {
  const embeddings = new LocalEmbeddingService();

  it("returns a 1536-dimension unit vector for a chunk of text", async () => {
    const vector = await embeddings.generateEmbedding("[Category: policy | Title: Warranty]\nThirty day cover.");

    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(vector.every((value) => Number.isFinite(value))).toBe(true);
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it("returns the same vector for the same text and a different vector when the text changes", async () => {
    const first = await embeddings.generateEmbedding("Thirty day cover.");
    const repeat = await embeddings.generateEmbedding("Thirty day cover.");
    const changed = await embeddings.generateEmbedding("Seven day returns.");

    expect(repeat).toEqual(first);
    expect(changed).not.toEqual(first);
  });
});
