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

describe("GET /api/v1/organizations", () => {
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

  it("returns only the organizations the caller belongs to, with that caller's role", async () => {
    const owner = await register("list-owner@mobilestore.test");
    const colleague = await register("list-colleague@mobilestore.test");
    const mobileStoreId = await createOrganization(owner.accessToken, "Mobile Store");
    const northwindId = await createOrganization(colleague.accessToken, "Northwind Phones");

    await new MembershipRepository(client.db()).create({
      userId: new ObjectId(owner.userId),
      organizationId: new ObjectId(northwindId),
      role: "agent",
    });

    const response = await request(app()).get("/api/v1/organizations").set("Authorization", `Bearer ${owner.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: mobileStoreId,
        name: "Mobile Store",
        slug: "mobile-store",
        role: "owner",
        membershipStatus: "active",
      }),
      expect.objectContaining({
        id: northwindId,
        name: "Northwind Phones",
        slug: "northwind-phones",
        role: "agent",
        membershipStatus: "active",
      }),
    ]);

    const colleagueList = await request(app())
      .get("/api/v1/organizations")
      .set("Authorization", `Bearer ${colleague.accessToken}`);

    expect(colleagueList.status).toBe(200);
    expect(colleagueList.body.data).toEqual([
      expect.objectContaining({ id: northwindId, role: "owner" }),
    ]);
    expect(colleagueList.body.data).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: mobileStoreId })]));
  });

  it("returns an empty list when the user has no organizations", async () => {
    const user = await register("list-empty@mobilestore.test");

    const response = await request(app()).get("/api/v1/organizations").set("Authorization", `Bearer ${user.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("rejects an unauthenticated list", async () => {
    const response = await request(app()).get("/api/v1/organizations");

    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({ code: "UNAUTHORIZED", message: "Authentication required" });
  });
});
