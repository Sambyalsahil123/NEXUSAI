import { MongoMemoryServer } from "mongodb-memory-server";
import { ObjectId, type MongoClient } from "mongodb";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectMongo, disconnectMongo } from "../src/db/mongo.js";
import { KNOWLEDGE_CHUNKS_COLLECTION, ensureChunkIndexes } from "../src/models/chunk.model.js";
import { ensureKnowledgeIndexes } from "../src/models/knowledge.model.js";
import { ensureMembershipIndexes } from "../src/models/membership.model.js";
import { ensureOrganizationIndexes } from "../src/models/organization.model.js";
import { ensureSessionIndexes } from "../src/models/session.model.js";
import { ensureUserIndexes } from "../src/models/user.model.js";
import { ChunkRepository } from "../src/repositories/chunk.repository.js";
import { KnowledgeRepository } from "../src/repositories/knowledge.repository.js";
import { MembershipRepository } from "../src/repositories/membership.repository.js";
import { OrganizationRepository } from "../src/repositories/organization.repository.js";
import { SessionRepository } from "../src/repositories/session.repository.js";
import { UserRepository } from "../src/repositories/user.repository.js";
import { AuthService } from "../src/services/auth.service.js";
import { LocalEmbeddingService } from "../src/services/embedding.service.js";
import { HealthService } from "../src/services/health.service.js";
import { KnowledgeService } from "../src/services/knowledge.service.js";
import { OrganizationService } from "../src/services/organization.service.js";
import { RetrievalService, cosineSimilarity } from "../src/services/retrieval.service.js";
import { createLogger } from "../src/utils/logger.js";

const JWT_SECRET = "test-jwt-secret-that-is-32-characters-long";
const WARRANTY = "Alpha phones include a thirty day warranty.";

describe("cosine similarity", () => {
  it("is 1 for the same direction and 0 for perpendicular vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([2, 0], [4, 0])).toBeCloseTo(1);
  });
});

describe("POST /api/v1/knowledge/search", () => {
  let memoryServer: MongoMemoryServer;
  let client: MongoClient;

  beforeAll(async () => {
    memoryServer = await MongoMemoryServer.create();
    client = await connectMongo(memoryServer.getUri());
    await ensureUserIndexes(client.db());
    await ensureSessionIndexes(client.db());
    await ensureOrganizationIndexes(client.db());
    await ensureMembershipIndexes(client.db());
    await ensureKnowledgeIndexes(client.db());
    await ensureChunkIndexes(client.db());
  }, 60_000);

  afterAll(async () => {
    await disconnectMongo(client);
    await memoryServer.stop();
  });

  function app() {
    const embeddings = new LocalEmbeddingService();
    const chunks = new ChunkRepository(client.db());
    return createApp({
      healthService: new HealthService({
        async ping() {
          return undefined;
        },
      }),
      authService: new AuthService(new UserRepository(client.db()), new SessionRepository(client.db()), JWT_SECRET),
      organizationService: new OrganizationService(
        new OrganizationRepository(client.db()),
        new MembershipRepository(client.db()),
      ),
      knowledgeService: new KnowledgeService(new KnowledgeRepository(client.db()), chunks, embeddings),
      retrievalService: new RetrievalService(chunks, embeddings),
      ragService: {
        async ask() {
          throw new Error("not used");
        },
      },
      logger: createLogger("silent"),
      corsOrigin: "http://localhost:3000",
    });
  }

  async function register(email: string) {
    const response = await request(app()).post("/api/v1/auth/register").send({ email, password: "horse1234" });
    return {
      accessToken: response.body.data.accessToken as string,
      userId: response.body.data.user.id as string,
    };
  }

  async function createOrganization(accessToken: string, name: string) {
    const response = await request(app())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name });
    expect(response.status).toBe(201);
    return response.body.data.organization.id as string;
  }

  async function createArticle(accessToken: string, organizationId: string, title: string, content: string) {
    const response = await request(app())
      .post("/api/v1/knowledge")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-organization-id", organizationId)
      .send({ title, content, category: "policy" });
    expect(response.status).toBe(201);
    return response.body.data.id as string;
  }

  function search(accessToken: string, organizationId: string, body: { query: string; limit?: number; organizationId?: string }) {
    return request(app())
      .post("/api/v1/knowledge/search")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-organization-id", organizationId)
      .send(body);
  }

  it("ranks the tenant chunk whose text matches the query above the other tenant chunks", async () => {
    const owner = await register("search-owner@mobilestore.test");
    const agent = await register("search-agent@mobilestore.test");
    const organizationId = await createOrganization(owner.accessToken, "Search Mobile Store");
    await new MembershipRepository(client.db()).create({
      userId: new ObjectId(agent.userId),
      organizationId: new ObjectId(organizationId),
      role: "agent",
    });

    const warrantyId = await createArticle(owner.accessToken, organizationId, "Warranty", WARRANTY);
    const hoursId = await createArticle(
      owner.accessToken,
      organizationId,
      "Hours",
      "The shop is open from nine to six on weekdays.",
    );
    const warrantyChunk = await client.db().collection(KNOWLEDGE_CHUNKS_COLLECTION).findOne({
      documentId: new ObjectId(warrantyId),
    });
    const hiddenDocumentId = new ObjectId();
    await client.db().collection(KNOWLEDGE_CHUNKS_COLLECTION).insertOne({
      _id: new ObjectId(),
      organizationId: new ObjectId(organizationId),
      documentId: hiddenDocumentId,
      chunkIndex: 0,
      content: warrantyChunk?.content,
      metadata: warrantyChunk?.metadata,
      embedding: warrantyChunk?.embedding,
      isEmbedded: false,
      createdAt: new Date(),
    });

    const response = await search(owner.accessToken, organizationId, { query: String(warrantyChunk?.content) });
    const agentResponse = await search(agent.accessToken, organizationId, { query: String(warrantyChunk?.content), limit: 1 });

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      documentId: warrantyId,
      metadata: { category: "policy", title: "Warranty" },
    });
    expect(response.body.data[0].score).toBeCloseTo(1, 5);
    expect(response.body.data[1].documentId).toBe(hoursId);
    expect(response.body.data[1].score).toBeLessThan(response.body.data[0].score);
    expect(response.body.data.map((chunk: { documentId: string }) => chunk.documentId)).not.toContain(
      hiddenDocumentId.toHexString(),
    );

    expect(agentResponse.status).toBe(200);
    expect(agentResponse.body.data).toHaveLength(1);
    expect(agentResponse.body.data[0].documentId).toBe(warrantyId);
  });

  it("never returns another organization's chunk, even when that chunk has the same text", async () => {
    const owner = await register("search-tenant-a@mobilestore.test");
    const other = await register("search-tenant-b@mobilestore.test");
    const organizationId = await createOrganization(owner.accessToken, "Tenant A Phones");
    const otherOrganizationId = await createOrganization(other.accessToken, "Tenant B Phones");
    const localId = await createArticle(owner.accessToken, organizationId, "Warranty", WARRANTY);
    const foreignId = await createArticle(other.accessToken, otherOrganizationId, "Warranty", WARRANTY);
    const localChunk = await client.db().collection(KNOWLEDGE_CHUNKS_COLLECTION).findOne({
      documentId: new ObjectId(localId),
    });

    const response = await search(owner.accessToken, organizationId, {
      query: String(localChunk?.content),
      organizationId: otherOrganizationId,
    });

    expect(response.status).toBe(200);
    const documentIds = response.body.data.map((chunk: { documentId: string }) => chunk.documentId);
    expect(documentIds).toContain(localId);
    expect(documentIds).not.toContain(foreignId);
  });
});
