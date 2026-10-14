import { MongoMemoryServer } from "mongodb-memory-server";
import { ObjectId, type MongoClient } from "mongodb";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectMongo, disconnectMongo } from "../src/db/mongo.js";
import { MEMBERSHIPS_COLLECTION, ensureMembershipIndexes } from "../src/models/membership.model.js";
import { ORGANIZATIONS_COLLECTION, ensureOrganizationIndexes } from "../src/models/organization.model.js";
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

describe("GET /api/v1/workspaces/current", () => {
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

  function current(accessToken: string, organizationId?: string) {
    const call = request(app()).get("/api/v1/workspaces/current").set("Authorization", `Bearer ${accessToken}`);
    if (organizationId) {
      call.set("x-organization-id", organizationId);
    }
    return call;
  }

  it("returns the organization and membership named by a header the caller belongs to", async () => {
    const owner = await register("tenant-owner@mobilestore.test");
    const organizationId = await createOrganization(owner.accessToken, "Mobile Store");

    const response = await current(owner.accessToken, organizationId);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.organization).toMatchObject({
      id: organizationId,
      name: "Mobile Store",
      slug: "mobile-store",
      status: "active",
    });
    expect(response.body.data.membership).toMatchObject({ role: "owner", status: "active" });
  });

  it("rejects a request that does not name an organization", async () => {
    const owner = await register("tenant-missing@mobilestore.test");

    const response = await current(owner.accessToken);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Organization id is required",
    });
  });

  it("rejects an organization the caller does not belong to", async () => {
    const owner = await register("tenant-belongs@mobilestore.test");
    const stranger = await register("tenant-stranger@mobilestore.test");
    const organizationId = await createOrganization(owner.accessToken, "Northwind Phones");

    const response = await current(stranger.accessToken, organizationId);

    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({
      code: "FORBIDDEN",
      message: "You do not have access to this organization",
    });
  });

  it("rejects a disabled membership and a suspended organization", async () => {
    const owner = await register("tenant-disabled@mobilestore.test");
    const disabledOrganizationId = await createOrganization(owner.accessToken, "Disabled Shop");
    const suspendedOrganizationId = await createOrganization(owner.accessToken, "Suspended Shop");

    await client
      .db()
      .collection(MEMBERSHIPS_COLLECTION)
      .updateOne(
        { userId: new ObjectId(owner.userId), organizationId: new ObjectId(disabledOrganizationId) },
        { $set: { status: "disabled" } },
      );
    await client
      .db()
      .collection(ORGANIZATIONS_COLLECTION)
      .updateOne({ _id: new ObjectId(suspendedOrganizationId) }, { $set: { status: "suspended" } });

    const disabled = await current(owner.accessToken, disabledOrganizationId);
    const suspended = await current(owner.accessToken, suspendedOrganizationId);

    expect(disabled.status).toBe(403);
    expect(suspended.status).toBe(403);
    expect(disabled.body.error).toEqual(suspended.body.error);
  });
});
