import { createHash } from "node:crypto";

/**
 * Same width as OpenAI text-embedding-3-small.
 * A provider adapter returns a vector of this length. This module does not call a provider.
 */
export const EMBEDDING_DIMENSIONS = 1536;

export interface IEmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
}

/**
 * Deterministic stand-in used until a provider is configured.
 * Equal text produces an equal unit vector. The numbers are not semantic.
 */
export class LocalEmbeddingService implements IEmbeddingService {
  constructor(private readonly dimensions = EMBEDDING_DIMENSIONS) {}

  async generateEmbedding(text: string): Promise<number[]> {
    const vector = new Array<number>(this.dimensions);
    let seed = createHash("sha256").update(text).digest();
    let offset = 0;

    for (let index = 0; index < this.dimensions; index += 1) {
      if (offset + 4 > seed.length) {
        seed = createHash("sha256").update(seed).update(String(index)).digest();
        offset = 0;
      }
      const value = seed.readUInt32BE(offset);
      offset += 4;
      vector[index] = (value / 0xffffffff) * 2 - 1;
    }

    return unitVector(vector);
  }
}

function unitVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }
  return vector.map((value) => value / magnitude);
}
