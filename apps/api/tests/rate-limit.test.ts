import type { Express } from "express";
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
import {
  MemorySlidingWindowStore,
  PUBLIC_SESSION_LIMIT,
  PUBLIC_STREAM_LIMIT,
} from "../src/middleware/rate-limiter.middleware.js";
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
const QUESTION = "What warranty do Alpha phones include?";

describe("sliding window store", () => {
  it("expires hits after the window and keeps other keys separate", async () => {
    const store = new MemorySlidingWindowStore();
    const start = 1_000_000;

    expect((await store.hit({ key: "ip-a", limit: 1, windowMs: 60_000, now: start })).allowed).toBe(true);

    const blocked = await store.hit({ key: "ip-a", limit: 1, windowMs: 60_000, now: start + 1_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(59);

    const expired = await store.hit({ key: "ip-a", limit: 1, windowMs: 60_000, now: start + 60_000 });
    expect(expired.allowed).toBe(true);

    const otherKey = await store.hit({ key: "ip-b", limit: 1, windowMs: 60_000, now: start });
    expect(otherKey.allowed).toBe(true);
  });
});

describe("public widget rate limits", () => {
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

  function buildApp(): Express {
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

  async function register(server: Express, email: string) {
    const response = await request(server).post("/api/v1/auth/register").send({ email, password: "horse1234" });
    return { accessToken: response.body.data.accessToken as string };
  }

  async function createOrganization(server: Express, accessToken: string, name: string) {
    const response = await request(server)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name });
    expect(response.status).toBe(201);
    return {
      id: response.body.data.organization.id as string,
      publishableKey: response.body.data.organization.publishableKey as string,
    };
  }

  async function createVerifiedArticle(server: Express, accessToken: string, organizationId: string) {
    const response = await request(server)
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

  function openConversation(server: Express, publishableKey: string, ip?: string) {
    const call = request(server).post("/api/v1/public/conversations").set("x-publishable-key", publishableKey);
    if (ip) {
      call.set("X-Forwarded-For", ip);
    }
    return call.send({});
  }

  function streamMessage(server: Express, publishableKey: string, conversationId: string) {
    return request(server)
      .post(`/api/v1/public/conversations/${conversationId}/messages/stream`)
      .set("x-publishable-key", publishableKey)
      .send({ content: QUESTION });
  }

  it("returns a normal event stream while the visitor is inside the quota", async () => {
    const server = buildApp();
    const owner = await register(server, "rate-ok@mobilestore.test");
    const organization = await createOrganization(server, owner.accessToken, "Rate Ok Store");
    await createVerifiedArticle(server, owner.accessToken, organization.id);
    const created = await openConversation(server, organization.publishableKey);
    expect(created.status).toBe(201);

    const streamed = await streamMessage(server, organization.publishableKey, created.body.data.id as string);

    expect(streamed.status).toBe(200);
    expect(streamed.headers["content-type"]).toContain("text/event-stream");
    const reply = parseSse(streamed.text)
      .filter((event) => event.type === "token")
      .map((event) => event.content ?? "")
      .join("");
    expect(reply).toContain(WARRANTY);
  });

  it("rejects a stream burst and still serves a different organization", async () => {
    const server = buildApp();
    const owner = await register(server, "rate-burst-a@mobilestore.test");
    const other = await register(server, "rate-burst-b@mobilestore.test");
    const organization = await createOrganization(server, owner.accessToken, "Rate Burst A");
    const otherOrganization = await createOrganization(server, other.accessToken, "Rate Burst B");
    await createVerifiedArticle(server, owner.accessToken, organization.id);
    await createVerifiedArticle(server, other.accessToken, otherOrganization.id);
    const created = await openConversation(server, organization.publishableKey);
    const otherCreated = await openConversation(server, otherOrganization.publishableKey);
    const conversationId = created.body.data.id as string;
    const otherConversationId = otherCreated.body.data.id as string;

    for (let attempt = 0; attempt < PUBLIC_STREAM_LIMIT; attempt += 1) {
      const allowed = await streamMessage(server, organization.publishableKey, conversationId);
      expect(allowed.status).toBe(200);
    }

    const before = await client
      .db()
      .collection(MESSAGES_COLLECTION)
      .countDocuments({ conversationId: new ObjectId(conversationId) });
    const blocked = await streamMessage(server, organization.publishableKey, conversationId);
    const after = await client
      .db()
      .collection(MESSAGES_COLLECTION)
      .countDocuments({ conversationId: new ObjectId(conversationId) });

    expect(blocked.status).toBe(429);
    expect(blocked.headers["content-type"]).toContain("application/json");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.body.error).toMatchObject({
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests, please slow down.",
    });
    expect(after).toBe(before);

    const otherStream = await streamMessage(server, otherOrganization.publishableKey, otherConversationId);
    expect(otherStream.status).toBe(200);
    expect(otherStream.headers["content-type"]).toContain("text/event-stream");
  });

  it("rejects extra session creates from one IP and still accepts another IP", async () => {
    const server = buildApp();
    server.set("trust proxy", true);
    const owner = await register(server, "rate-session@mobilestore.test");
    const organization = await createOrganization(server, owner.accessToken, "Rate Session Store");

    for (let attempt = 0; attempt < PUBLIC_SESSION_LIMIT; attempt += 1) {
      const allowed = await openConversation(server, organization.publishableKey, "203.0.113.10");
      expect(allowed.status).toBe(201);
    }

    const blocked = await request(server)
      .post("/api/v1/public/conversations")
      .set("X-Forwarded-For", "203.0.113.10")
      .set("x-publishable-key", "pk_live_unknown_key_0123456789ab")
      .send({});
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.body.error).toMatchObject({
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests, please slow down.",
    });

    const otherIp = await openConversation(server, organization.publishableKey, "203.0.113.20");
    expect(otherIp.status).toBe(201);
    expect(otherIp.body.data.channel).toBe("widget");
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
