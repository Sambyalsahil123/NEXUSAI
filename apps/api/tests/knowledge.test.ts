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
import { OrganizationService } from "../src/services/organization.service.js";
import { createLogger } from "../src/utils/logger.js";

const JWT_SECRET = "test-jwt-secret-that-is-32-characters-long";

describe("POST /api/v1/knowledge", () => {
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
      knowledgeService: new KnowledgeService(
        new KnowledgeRepository(client.db()),
        new ChunkRepository(client.db()),
        new LocalEmbeddingService(),
      ),
      retrievalService: {
        async search() {
          throw new Error("not used");
        },
      },
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

  it("stores a draft in the caller's organization and ignores a body organization id", async () => {
    const owner = await register("knowledge-owner@mobilestore.test");
    const organizationId = await createOrganization(owner.accessToken, "Mobile Store");
    const otherOrganizationId = new ObjectId().toHexString();

    const response = await request(app())
      .post("/api/v1/knowledge")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .set("x-organization-id", organizationId)
      .send({
        title: "Warranty",
        content: "UK-used phones include a 30-day warranty.",
        category: "policy",
        organizationId: otherOrganizationId,
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      organizationId,
      title: "Warranty",
      content: "UK-used phones include a 30-day warranty.",
      category: "policy",
      status: "draft",
    });
    expect(response.body.data.organizationId).not.toBe(otherOrganizationId);

    const stored = await client
      .db()
      .collection(KNOWLEDGE_COLLECTION)
      .findOne({ _id: new ObjectId(response.body.data.id as string) });
    expect(stored?.organizationId.toHexString()).toBe(organizationId);
    expect(stored?.createdBy.toHexString()).toBe(owner.userId);
    expect(stored?.status).toBe("draft");
  });

  it("blocks an agent who belongs to the organization", async () => {
    const owner = await register("knowledge-agent-owner@mobilestore.test");
    const agent = await register("knowledge-agent@mobilestore.test");
    const organizationId = await createOrganization(owner.accessToken, "Northwind Phones");

    await new MembershipRepository(client.db()).create({
      userId: new ObjectId(agent.userId),
      organizationId: new ObjectId(organizationId),
      role: "agent",
    });

    const response = await request(app())
      .post("/api/v1/knowledge")
      .set("Authorization", `Bearer ${agent.accessToken}`)
      .set("x-organization-id", organizationId)
      .send({
        title: "Warranty",
        content: "Agents cannot publish this.",
        category: "faq",
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({
      code: "FORBIDDEN",
      message: "You do not have permission to perform this action",
    });
    expect(await client.db().collection(KNOWLEDGE_COLLECTION).countDocuments({ organizationId: new ObjectId(organizationId) })).toBe(
      0,
    );
  });
});
