import { MongoMemoryServer } from "mongodb-memory-server";
import { ObjectId, type MongoClient } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectMongo, disconnectMongo } from "../src/db/mongo.js";
import { ensureChunkIndexes } from "../src/models/chunk.model.js";
import { ensureKnowledgeIndexes } from "../src/models/knowledge.model.js";
import { ChunkRepository } from "../src/repositories/chunk.repository.js";
import { KnowledgeRepository } from "../src/repositories/knowledge.repository.js";
import { CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS, chunkKnowledge } from "../src/services/chunking.service.js";
import { EMBEDDING_DIMENSIONS, LocalEmbeddingService } from "../src/services/embedding.service.js";
import { KnowledgeService } from "../src/services/knowledge.service.js";

function sentence(index: number): string {
  return `Sentence ${String(index).padStart(3, "0")} covers this exact warranty case.`;
}

function article(sentences: number): string {
  return Array.from({ length: sentences }, (_, index) => sentence(index)).join(" ");
}

function bodyOf(content: string): string {
  return content.split("\n").slice(1).join("\n");
}

function sharedOverlap(previous: string, next: string): number {
  const limit = Math.min(previous.length, next.length);
  for (let length = limit; length > 0; length -= 1) {
    if (next.startsWith(previous.slice(-length))) {
      return length;
    }
  }
  return 0;
}

describe("chunkKnowledge", () => {
  const organizationId = new ObjectId().toHexString();
  const documentId = new ObjectId().toHexString();

  it("splits a long article into overlapping chunks that carry a context header", () => {
    const chunks = chunkKnowledge({
      organizationId,
      documentId,
      title: "Warranty",
      category: "policy",
      content: article(40),
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(chunks.map((_, index) => index));

    const first = chunks[0];
    const second = chunks[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) {
      return;
    }

    const firstBody = bodyOf(first.content);
    const secondBody = bodyOf(second.content);
    expect(first.content.startsWith("[Category: policy | Title: Warranty]\n")).toBe(true);
    expect(first.metadata).toEqual({
      category: "policy",
      title: "Warranty",
      headerContext: "[Category: policy | Title: Warranty]",
    });
    expect(firstBody.length).toBeGreaterThanOrEqual(500);
    expect(firstBody.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);

    const overlap = sharedOverlap(firstBody, secondBody);
    expect(overlap).toBeGreaterThanOrEqual(sentence(0).length);
    expect(overlap).toBeLessThanOrEqual(CHUNK_OVERLAP_CHARS);
  });

  it("copies the parent organization id and document id onto every chunk", () => {
    const chunks = chunkKnowledge({
      organizationId,
      documentId,
      title: "Warranty",
      category: "policy",
      content: article(40),
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.organizationId).toBe(organizationId);
      expect(chunk.documentId).toBe(documentId);
    }
  });
});

describe("stored knowledge chunks", () => {
  let memoryServer: MongoMemoryServer;
  let client: MongoClient;

  beforeAll(async () => {
    memoryServer = await MongoMemoryServer.create();
    client = await connectMongo(memoryServer.getUri());
    await ensureKnowledgeIndexes(client.db());
    await ensureChunkIndexes(client.db());
  }, 60_000);

  afterAll(async () => {
    await disconnectMongo(client);
    await memoryServer.stop();
  });

  it("saves chunks from the parent document and replaces them when the article changes", async () => {
    const organizationId = new ObjectId();
    const service = new KnowledgeService(
      new KnowledgeRepository(client.db()),
      new ChunkRepository(client.db()),
      new LocalEmbeddingService(),
    );
    const chunks = new ChunkRepository(client.db());
    const created = await service.create(
      { organizationId: organizationId.toHexString(), createdBy: new ObjectId().toHexString() },
      { title: "Warranty", content: article(40), category: "policy" },
    );

    const stored = await chunks.findByDocument(organizationId, new ObjectId(created.id));
    expect(stored.length).toBeGreaterThan(1);
    for (const chunk of stored) {
      expect(chunk.organizationId.toHexString()).toBe(organizationId.toHexString());
      expect(chunk.documentId.toHexString()).toBe(created.id);
      expect(chunk.content.startsWith("[Category: policy | Title: Warranty]\n")).toBe(true);
      expect(chunk.isEmbedded).toBe(true);
      expect(chunk.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
      expect(chunk.embedding.every((value) => Number.isFinite(value))).toBe(true);
    }

    const updated = await service.update(organizationId.toHexString(), created.id, {
      title: "Returns",
      content: "Returns are accepted within seven days.",
      category: "faq",
    });
    const replaced = await chunks.findByDocument(organizationId, new ObjectId(updated.id));

    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.organizationId.toHexString()).toBe(organizationId.toHexString());
    expect(replaced[0]?.documentId.toHexString()).toBe(created.id);
    expect(replaced[0]?.isEmbedded).toBe(true);
    expect(replaced[0]?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(replaced[0]?.embedding).not.toEqual(stored[0]?.embedding);
    expect(replaced[0]?.content).toBe("[Category: faq | Title: Returns]\nReturns are accepted within seven days.");
    expect(replaced[0]?.metadata.headerContext).toBe("[Category: faq | Title: Returns]");
  });
});
