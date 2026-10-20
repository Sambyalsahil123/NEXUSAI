import { MongoMemoryServer } from "mongodb-memory-server";
import { ObjectId, type MongoClient } from "mongodb";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectMongo, disconnectMongo } from "../src/db/mongo.js";
import { ensureChunkIndexes } from "../src/models/chunk.model.js";
import { ensureConversationIndexes } from "../src/models/conversation.model.js";
import { KNOWLEDGE_COLLECTION, ensureKnowledgeIndexes } from "../src/models/knowledge.model.js";
import { ensureMembershipIndexes } from "../src/models/membership.model.js";
import { MESSAGES_COLLECTION, ensureMessageIndexes } from "../src/models/message.model.js";
import { ensureOrganizationIndexes } from "../src/models/organization.model.js";
import { ensureSessionIndexes } from "../src/models/session.model.js";
import { ensureUserIndexes } from "../src/models/user.model.js";
import { ChunkRepository } from "../src/repositories/chunk.repository.js";
import { ConversationRepository } from "../src/repositories/conversation.repository.js";
import { KnowledgeRepository } from "../src/repositories/knowledge.repository.js";
import { MembershipRepository } from "../src/repositories/membership.repository.js";
import { MessageRepository } from "../src/repositories/message.repository.js";
import { OrganizationRepository } from "../src/repositories/organization.repository.js";
import { SessionRepository } from "../src/repositories/session.repository.js";
import { UserRepository } from "../src/repositories/user.repository.js";
import { AuthService } from "../src/services/auth.service.js";
import { ConversationService } from "../src/services/conversation.service.js";
import { LocalEmbeddingService } from "../src/services/embedding.service.js";
import { HealthService } from "../src/services/health.service.js";
import { KnowledgeService } from "../src/services/knowledge.service.js";
import { LocalLanguageModelService } from "../src/services/llm.service.js";
import { OrganizationService } from "../src/services/organization.service.js";
import { RagService } from "../src/services/rag.service.js";
import { RetrievalService } from "../src/services/retrieval.service.js";
import { createLogger } from "../src/utils/logger.js";

const JWT_SECRET = "test-jwt-secret-that-is-32-characters-long";
const WARRANTY = "Alpha phones include a thirty day warranty.";

describe("conversation sessions", () => {
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
    await ensureConversationIndexes(client.db());
    await ensureMessageIndexes(client.db());
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
    const ragService = new RagService(documents, retrievalService, new LocalLanguageModelService());
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
      ragService,
      conversationService: new ConversationService(
        new ConversationRepository(client.db()),
        new MessageRepository(client.db()),
        ragService,
      ),
      logger: createLogger("silent"),
      corsOrigin: "http://localhost:3000",
    });
  }

  async function register(email: string) {
    const response = await request(app()).post("/api/v1/auth/register").send({ email, password: "horse1234" });
    return { accessToken: response.body.data.accessToken as string };
  }

  async function createOrganization(accessToken: string, name: string) {
    const response = await request(app())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name });
    expect(response.status).toBe(201);
    return response.body.data.organization.id as string;
  }

  async function createVerifiedArticle(accessToken: string, organizationId: string) {
    const response = await request(app())
      .post("/api/v1/knowledge")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-organization-id", organizationId)
      .send({ title: "Warranty", content: WARRANTY, category: "policy" });
    expect(response.status).toBe(201);
    const documentId = response.body.data.id as string;
    await client
      .db()
      .collection(KNOWLEDGE_COLLECTION)
      .updateOne({ _id: new ObjectId(documentId) }, { $set: { status: "verified" } });
    return documentId;
  }

  function postConversation(accessToken: string, organizationId: string) {
    return request(app())
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-organization-id", organizationId)
      .send({});
  }

  function postMessage(accessToken: string, organizationId: string, conversationId: string, content: string) {
    return request(app())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-organization-id", organizationId)
      .send({ content });
  }

  it("keeps context across two messages in the same conversation", async () => {
    const owner = await register("conversation-owner@mobilestore.test");
    const organizationId = await createOrganization(owner.accessToken, "Conversation Mobile Store");
    const documentId = await createVerifiedArticle(owner.accessToken, organizationId);

    const created = await postConversation(owner.accessToken, organizationId);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      organizationId,
      title: "New conversation",
      channel: "api",
      status: "open",
    });
    const conversationId = created.body.data.id as string;

    const first = await postMessage(
      owner.accessToken,
      organizationId,
      conversationId,
      "What warranty do Alpha phones include?",
    );
    expect(first.status).toBe(200);
    expect(first.body.data.userMessage).toMatchObject({
      role: "user",
      content: "What warranty do Alpha phones include?",
    });
    expect(first.body.data.assistantMessage.content).toContain(WARRANTY);
    expect(first.body.data.assistantMessage.sources[0]).toMatchObject({ documentId, title: "Warranty" });

    const followUp = await postMessage(owner.accessToken, organizationId, conversationId, "How long does that last?");
    expect(followUp.status).toBe(200);
    expect(followUp.body.data.assistantMessage.content).toContain(WARRANTY);
    expect(followUp.body.data.conversationId).toBe(conversationId);

    const stored = await client
      .db()
      .collection(MESSAGES_COLLECTION)
      .find({ conversationId: new ObjectId(conversationId) })
      .sort({ createdAt: 1 })
      .toArray();
    expect(stored.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(stored.every((message) => message.organizationId.equals(new ObjectId(organizationId)))).toBe(true);
  });

  it("hides a conversation that belongs to another organization", async () => {
    const owner = await register("conversation-tenant-a@mobilestore.test");
    const other = await register("conversation-tenant-b@mobilestore.test");
    const organizationId = await createOrganization(owner.accessToken, "Conversation Tenant A");
    const otherOrganizationId = await createOrganization(other.accessToken, "Conversation Tenant B");
    await createVerifiedArticle(owner.accessToken, organizationId);

    const created = await postConversation(owner.accessToken, organizationId);
    const conversationId = created.body.data.id as string;

    const response = await postMessage(
      other.accessToken,
      otherOrganizationId,
      conversationId,
      "What warranty do Alpha phones include?",
    );

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(response.body.error.message).toBe("Conversation not found");

    const leaked = await client
      .db()
      .collection(MESSAGES_COLLECTION)
      .countDocuments({ organizationId: new ObjectId(otherOrganizationId) });
    expect(leaked).toBe(0);
  });
});
