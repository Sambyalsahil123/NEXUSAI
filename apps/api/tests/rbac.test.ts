import { MongoMemoryServer } from "mongodb-memory-server";
import { ObjectId, type MongoClient } from "mongodb";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectMongo, disconnectMongo } from "../src/db/mongo.js";
import { ensureMembershipIndexes } from "../src/models/membership.model.js";
import { ensureOrganizationIndexes } from "../src/models/organization.model.js";
import { ensureSessionIndexes } from "../src/models/session.model.js";
import { ensureUserIndexes } from "../src/models/user.model.js";
import { MembershipRepository } from "../src/repositories/membership.repository.js";
import { OrganizationRepository } from "../src/repositories/organization.repository.js";
import { SessionRepository } from "../src/repositories/session.repository.js";
import { UserRepository } from "../src/repositories/user.repository.js";
import { AuthService } from "../src/services/auth.service.js";
import { HealthService } from "../src/services/health.service.js";
import { OrganizationService } from "../src/services/organization.service.js";
import { createLogger } from "../src/utils/logger.js";

const JWT_SECRET = "test-jwt-secret-that-is-32-characters-long";

describe("PATCH /api/v1/organizations/current/settings", () => {
  let memoryServer: MongoMemoryServer;
  let client: MongoClient;

  beforeAll(async () => {
    memoryServer = await MongoMemoryServer.create();
    client = await connectMongo(memoryServer.getUri());
    await ensureUserIndexes(client.db());
    await ensureSessionIndexes(client.db());
    await ensureOrganizationIndexes(client.db());
    await ensureMembershipIndexes(client.db());
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
      knowledgeService: {
        async create() {
          throw new Error("not used");
        },
      },
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

  function updateSettings(accessToken: string, organizationId: string) {
    return request(app())
      .patch("/api/v1/organizations/current/settings")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-organization-id", organizationId);
  }

  it("allows an owner and an admin to update organization settings", async () => {
    const owner = await register("rbac-owner@mobilestore.test");
    const admin = await register("rbac-admin@mobilestore.test");
    const created = await request(app())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Mobile Store" });
    const organizationId = created.body.data.organization.id as string;

    await new MembershipRepository(client.db()).create({
      userId: new ObjectId(admin.userId),
      organizationId: new ObjectId(organizationId),
      role: "admin",
    });

    const ownerResponse = await updateSettings(owner.accessToken, organizationId);
    const adminResponse = await updateSettings(admin.accessToken, organizationId);

    expect(ownerResponse.status).toBe(200);
    expect(adminResponse.status).toBe(200);
    expect(ownerResponse.body.success).toBe(true);
    expect(ownerResponse.body.data).toEqual({ message: "Settings updated" });
    expect(adminResponse.body.data).toEqual({ message: "Settings updated" });
  });

  it("blocks an agent who belongs to the organization", async () => {
    const owner = await register("rbac-agent-owner@mobilestore.test");
    const agent = await register("rbac-agent@mobilestore.test");
    const created = await request(app())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Northwind Phones" });
    const organizationId = created.body.data.organization.id as string;

    await new MembershipRepository(client.db()).create({
      userId: new ObjectId(agent.userId),
      organizationId: new ObjectId(organizationId),
      role: "agent",
    });

    const response = await updateSettings(agent.accessToken, organizationId);

    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({
      code: "FORBIDDEN",
      message: "You do not have permission to perform this action",
    });
  });
});
