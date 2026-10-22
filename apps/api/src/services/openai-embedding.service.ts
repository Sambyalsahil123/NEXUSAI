import { EMBEDDING_DIMENSIONS, unitVector, type IEmbeddingService } from "./embedding.service.js";
import type { OpenAiApi } from "./openai.client.js";

export class OpenAiEmbeddingService implements IEmbeddingService {
  constructor(
    private readonly client: OpenAiApi,
    private readonly model: string,
  ) {}

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error("OpenAI returned no embedding");
    }
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`OpenAI embedding length ${embedding.length} does not match ${EMBEDDING_DIMENSIONS}`);
    }
    return unitVector(embedding);
  }
}
