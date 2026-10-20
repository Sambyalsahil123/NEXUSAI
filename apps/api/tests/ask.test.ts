import { MongoMemoryServer } from "mongodb-memory-server";
import { ObjectId, type MongoClient } from "mongodb";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectMongo, disconnectMongo } from "../src/db/mongo.js";
import { ensureChunkIndexes } from "../src/models/chunk.model.js";
import { KNOWLEDGE_COLLECTION, ensureKnowledgeIndexes } from "../src/models/knowledge.model.js";
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
import { INSUFFICIENT_KNOWLEDGE_REPLY, LocalLanguageModelService } from "../src/services/llm.service.js";
import { OrganizationService } from "../src/services/organization.service.js";
import { RagService } from "../src/services/rag.service.js";
import { RetrievalService } from "../src/services/retrieval.service.js";
import { createLogger } from "../src/utils/logger.js";

const JWT_SECRET = "test-jwt-secret-that-is-32-characters-long";
const WARRANTY = "Alpha phones include a thirty day warranty.";

describe("POST /api/v1/knowledge/ask", () => {
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
    const documents = new KnowledgeRepository(client.db());
    const retrievalService = new RetrievalService(chunks, embeddings);
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
      knowledgeService: new KnowledgeService(documents, chunks, embeddings),
      retrievalService,
      ragService: new RagService(documents, retrievalService, new LocalLanguageModelService()),
      conversationService: {
        async create() {
          throw new Error("not used");
        },
        async postMessage() {
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

  async function verify(documentId: string) {
    await client
      .db()
      .collection(KNOWLEDGE_COLLECTION)
      .updateOne({ _id: new ObjectId(documentId) }, { $set: { status: "verified" } });
  }

  function ask(accessToken: string, organizationId: string, question: string) {
    return request(app())
      .post("/api/v1/knowledge/ask")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-organization-id", organizationId)
      .send({ question });
  }

  it("answers from a verified article and refuses while that article is still a draft", async () => {
    const owner = await register("ask-owner@mobilestore.test");
    const organizationId = await createOrganization(owner.accessToken, "Ask Mobile Store");
    const documentId = await createArticle(owner.accessToken, organizationId, "Warranty", WARRANTY);

    const draft = await ask(owner.accessToken, organizationId, "What warranty do Alpha phones include?");
    expect(draft.status).toBe(200);
    expect(draft.body.data.answer).toBe(INSUFFICIENT_KNOWLEDGE_REPLY);
    expect(draft.body.data.sources).toEqual([]);

    await verify(documentId);
    const verified = await ask(owner.accessToken, organizationId, "What warranty do Alpha phones include?");

    expect(verified.status).toBe(200);
    expect(verified.body.data.answer).toContain(WARRANTY);
    expect(verified.body.data.sources[0]).toMatchObject({ documentId, title: "Warranty" });
    expect(typeof verified.body.data.sources[0].score).toBe("number");
  });

  it("refuses when the verified context does not contain the fact", async () => {
    const owner = await register("ask-missing@mobilestore.test");
    const organizationId = await createOrganization(owner.accessToken, "Ask Hours Store");
    const documentId = await createArticle(
      owner.accessToken,
      organizationId,
      "Hours",
      "The shop is open from nine to six on weekdays.",
    );
    await verify(documentId);

    const response = await ask(owner.accessToken, organizationId, "What is the capital of France?");

    expect(response.status).toBe(200);
    expect(response.body.data.answer).toBe(INSUFFICIENT_KNOWLEDGE_REPLY);
    expect(response.body.data.answer).not.toContain("Paris");
  });

  it("refuses when only another organization has the verified answer", async () => {
    const owner = await register("ask-tenant-a@mobilestore.test");
    const other = await register("ask-tenant-b@mobilestore.test");
    const organizationId = await createOrganization(owner.accessToken, "Ask Tenant A");
    const otherOrganizationId = await createOrganization(other.accessToken, "Ask Tenant B");
    const localId = await createArticle(
      owner.accessToken,
      organizationId,
      "Hours",
      "The shop is open from nine to six on weekdays.",
    );
    const foreignId = await createArticle(other.accessToken, otherOrganizationId, "Warranty", WARRANTY);
    await verify(localId);
    await verify(foreignId);

    const response = await ask(owner.accessToken, organizationId, "What warranty do Alpha phones include?");
    const sourceIds = response.body.data.sources.map((source: { documentId: string }) => source.documentId);

    expect(response.status).toBe(200);
    expect(response.body.data.answer).toBe(INSUFFICIENT_KNOWLEDGE_REPLY);
    expect(sourceIds).not.toContain(foreignId);
    expect(sourceIds).toContain(localId);
  });
});
