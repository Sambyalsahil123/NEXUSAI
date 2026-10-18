import { ObjectId } from "mongodb";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";
import { INSUFFICIENT_KNOWLEDGE_REPLY, type ILanguageModelService } from "./llm.service.js";
import type { RetrievedChunk, RetrievalService } from "./retrieval.service.js";

export type AnswerSource = {
  documentId: string;
  title: string;
  score: number;
};

export type GroundedAnswer = {
  answer: string;
  sources: AnswerSource[];
};

type VerifiedDocumentStore = Pick<KnowledgeRepository, "findVerifiedIds">;
type ChunkRetriever = Pick<RetrievalService, "search">;

export class RagService {
  constructor(
    private readonly documents: VerifiedDocumentStore,
    private readonly retrieval: ChunkRetriever,
    private readonly languageModel: ILanguageModelService,
  ) {}

  async ask(organizationId: string, question: string): Promise<GroundedAnswer> {
    if (!ObjectId.isValid(organizationId)) {
      throw new AppError(ErrorCodes.FORBIDDEN, "You do not have access to this organization", 403);
    }

    const verifiedIds = await this.documents.findVerifiedIds(new ObjectId(organizationId));
    const chunks =
      verifiedIds.length === 0
        ? []
        : await this.retrieval.search({
            organizationId,
            query: question,
            documentIds: verifiedIds.map((id) => id.toHexString()),
          });
    const answer = await this.languageModel.generateResponse(groundedSystemPrompt(chunks), question);

    return {
      answer,
      sources: chunks.map((chunk) => ({
        documentId: chunk.documentId,
        title: chunk.metadata.title,
        score: chunk.score,
      })),
    };
  }
}

export function groundedSystemPrompt(chunks: RetrievedChunk[]): string {
  const context =
    chunks.length === 0
      ? "(no context)"
      : chunks
          .map((chunk, index) => `[${index + 1}] Title: ${chunk.metadata.title}\n${chunk.content}`)
          .join("\n\n");

  return [
    "You answer questions for one organization using only the context below.",
    `Answer solely based on the provided context. If the answer cannot be found in the context, explicitly reply: "${INSUFFICIENT_KNOWLEDGE_REPLY}"`,
    "Do not add facts from outside the context.",
    "",
    "Context:",
    context,
  ].join("\n");
}
