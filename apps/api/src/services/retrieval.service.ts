import { ObjectId } from "mongodb";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import type { KnowledgeChunkMetadata } from "../models/chunk.model.js";
import type { ChunkRepository } from "../repositories/chunk.repository.js";
import type { IEmbeddingService } from "./embedding.service.js";

export const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 20;

export type RetrievedChunk = {
  documentId: string;
  content: string;
  metadata: KnowledgeChunkMetadata;
  score: number;
};

type EmbeddedChunkStore = Pick<ChunkRepository, "findEmbeddedByOrganization">;

export class RetrievalService {
  constructor(
    private readonly chunks: EmbeddedChunkStore,
    private readonly embeddings: IEmbeddingService,
  ) {}

  async search(input: {
    organizationId: string;
    query: string;
    limit?: number;
    documentIds?: string[];
  }): Promise<RetrievedChunk[]> {
    if (!ObjectId.isValid(input.organizationId)) {
      throw new AppError(ErrorCodes.FORBIDDEN, "You do not have access to this organization", 403);
    }

    const queryVector = await this.embeddings.generateEmbedding(input.query);
    const allowed = input.documentIds === undefined ? null : new Set(input.documentIds);
    const candidates = (await this.chunks.findEmbeddedByOrganization(new ObjectId(input.organizationId))).filter(
      (chunk) => allowed === null || allowed.has(chunk.documentId.toHexString()),
    );

    return candidates
      .map((chunk) => ({
        documentId: chunk.documentId.toHexString(),
        content: chunk.content,
        metadata: chunk.metadata,
        score: cosineSimilarity(queryVector, chunk.embedding),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, clampLimit(input.limit));
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_SEARCH_LIMIT;
  }
  return Math.min(MAX_SEARCH_LIMIT, Math.max(1, limit));
}

/** For unit vectors this is the same number as the dot product. */
export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}
