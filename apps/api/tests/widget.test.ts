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

describe("public widget access", () => {
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
    return {
      id: response.body.data.organization.id as string,
      publishableKey: response.body.data.organization.publishableKey as string,
    };
  }

  async function createVerifiedArticle(accessToken: string, organizationId: string) {
    const response = await request(app())
      .post("/api/v1/knowledge")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-organization-id", organizationId)
      .send({ title: "Warranty", content: WARRANTY, category: "policy" });
    expect(response.status).toBe(201);
    await client
      .db()
      .collection(KNOWLEDGE_COLLECTION)
      .updateOne({ _id: new ObjectId(response.body.data.id as string) }, { $set: { status: "verified" } });
  }

  it("opens a widget conversation and streams a grounded reply for a valid key", async () => {
    const owner = await register("widget-owner@mobilestore.test");
    const organization = await createOrganization(owner.accessToken, "Widget Mobile Store");
    await createVerifiedArticle(owner.accessToken, organization.id);

    const created = await request(app())
      .post("/api/v1/public/conversations")
      .set("x-publishable-key", organization.publishableKey)
      .send({ channel: "api", title: "spoofed" });

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      organizationId: organization.id,
      channel: "widget",
      title: "New conversation",
      status: "open",
    });
    const conversationId = created.body.data.id as string;

    const streamed = await request(app())
      .post(`/api/v1/public/conversations/${conversationId}/messages/stream`)
      .query({ key: organization.publishableKey })
      .send({ content: "What warranty do Alpha phones include?" });

    expect(streamed.status).toBe(200);
    expect(streamed.headers["content-type"]).toContain("text/event-stream");
    const events = parseSse(streamed.text);
    const reply = events
      .filter((event) => event.type === "token")
      .map((event) => event.content ?? "")
      .join("");
    expect(reply).toContain(WARRANTY);
    expect(events.at(-1)).toEqual({ type: "done" });

    const stored = await client
      .db()
      .collection(MESSAGES_COLLECTION)
      .find({ conversationId: new ObjectId(conversationId) })
      .toArray();
    expect(stored.every((message) => message.organizationId.equals(new ObjectId(organization.id)))).toBe(true);
  });

  it("rejects a missing, invalid, or cross-tenant publishable key", async () => {
    const owner = await register("widget-tenant-a@mobilestore.test");
    const other = await register("widget-tenant-b@mobilestore.test");
    const organization = await createOrganization(owner.accessToken, "Widget Tenant A");
    const otherOrganization = await createOrganization(other.accessToken, "Widget Tenant B");
    await createVerifiedArticle(owner.accessToken, organization.id);

    const created = await request(app())
      .post("/api/v1/public/conversations")
      .set("x-publishable-key", organization.publishableKey)
      .send({});
    expect(created.status).toBe(201);
    const conversationId = created.body.data.id as string;

    const missing = await request(app()).post("/api/v1/public/conversations").send({});
    expect(missing.status).toBe(401);
    expect(missing.body.error).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Invalid or missing publishable key",
    });

    const invalid = await request(app())
      .post("/api/v1/public/conversations")
      .set("x-publishable-key", "pk_live_unknown_key_0123456789ab")
      .send({});
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe("UNAUTHORIZED");

    const crossTenant = await request(app())
      .post(`/api/v1/public/conversations/${conversationId}/messages/stream`)
      .set("x-publishable-key", otherOrganization.publishableKey)
      .send({ content: "What warranty do Alpha phones include?" });
    expect(crossTenant.status).toBe(404);
    expect(crossTenant.body.error).toMatchObject({ code: "NOT_FOUND", message: "Conversation not found" });

    const leaked = await client
      .db()
      .collection(MESSAGES_COLLECTION)
      .countDocuments({ organizationId: new ObjectId(otherOrganization.id) });
    expect(leaked).toBe(0);
  });

  it("does not allow a publishable key to upload knowledge or change settings", async () => {
    const owner = await register("widget-admin@mobilestore.test");
    const organization = await createOrganization(owner.accessToken, "Widget Admin Store");
    const knowledgeCount = await client.db().collection(KNOWLEDGE_COLLECTION).countDocuments();

    const upload = await request(app())
      .post("/api/v1/knowledge")
      .set("x-publishable-key", organization.publishableKey)
      .set("x-organization-id", organization.id)
      .send({ title: "Secret", content: "Staff only policy.", category: "policy" });
    expect(upload.status).toBe(401);
    expect(upload.body.error.code).toBe("UNAUTHORIZED");
    expect(await client.db().collection(KNOWLEDGE_COLLECTION).countDocuments()).toBe(knowledgeCount);

    const settings = await request(app())
      .patch("/api/v1/organizations/current/settings")
      .set("x-publishable-key", organization.publishableKey)
      .set("x-organization-id", organization.id)
      .send({ name: "Taken Over" });
    expect(settings.status).toBe(401);
    expect(settings.body.error.code).toBe("UNAUTHORIZED");
  });
});

type StreamEvent = {
  type: string;
  content?: string;
};

function parseSse(body: string): StreamEvent[] {
  return body
    .split("\n\n")
    .map((block) => block.trim())
    .filter((block) => block.startsWith("data:"))
    .map((block) => JSON.parse(block.slice("data:".length).trim()) as StreamEvent);
}
