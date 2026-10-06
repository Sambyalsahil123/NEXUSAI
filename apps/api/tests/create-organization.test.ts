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

describe("OrganizationService create", () => {
  it("removes the organization when the owner membership cannot be saved", async () => {
    const organizations: ObjectId[] = [];
    const service = new OrganizationService(
      {
        async create() {
          const id = new ObjectId();
          organizations.push(id);
          return {
            _id: id,
            name: "Mobile Store",
            slug: "mobile-store",
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
        async deleteById(id) {
          const index = organizations.findIndex((organizationId) => organizationId.equals(id));
          organizations.splice(index, 1);
        },
        async findByIds() {
          return [];
        },
      },
      {
        async create() {
          throw new Error("membership write failed");
        },
        async findByUserId() {
          return [];
        },
      },
    );

    await expect(service.create(new ObjectId().toHexString(), { name: "Mobile Store" })).rejects.toThrow(
      "membership write failed",
    );
    expect(organizations).toEqual([]);
  });

  it("returns 409 when the slug is already taken and does not create a membership", async () => {
    let membershipsCreated = 0;
    const service = new OrganizationService(
      {
        async create() {
          throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
        },
        async deleteById() {
          return undefined;
        },
        async findByIds() {
          return [];
        },
      },
      {
        async create() {
          membershipsCreated += 1;
          throw new Error("not used");
        },
        async findByUserId() {
          return [];
        },
      },
    );

    await expect(service.create(new ObjectId().toHexString(), { name: "Mobile Store" })).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT",
    });
    expect(membershipsCreated).toBe(0);
  });
});

describe("POST /api/v1/organizations", () => {
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

  it("creates an organization and makes the caller its owner", async () => {
    const { accessToken, userId } = await register("owner@mobilestore.test");

    const response = await request(app())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Mobile Store" });

    expect(response.status).toBe(201);
    expect(response.body.data.organization).toMatchObject({
      name: "Mobile Store",
      slug: "mobile-store",
      status: "active",
    });
    expect(response.body.data.membership).toMatchObject({ role: "owner", status: "active" });

    const organizationId = new ObjectId(response.body.data.organization.id as string);
    const storedOrganization = await client.db().collection(ORGANIZATIONS_COLLECTION).findOne({ _id: organizationId });
    const storedMembership = await client.db().collection(MEMBERSHIPS_COLLECTION).findOne({ organizationId });

    expect(storedOrganization?.slug).toBe("mobile-store");
    expect(storedMembership?.role).toBe("owner");
    expect(storedMembership?.userId.toHexString()).toBe(userId);
  });

  it("rejects an unauthenticated create", async () => {
    const response = await request(app()).post("/api/v1/organizations").send({ name: "Mobile Store" });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({ code: "UNAUTHORIZED", message: "Authentication required" });
  });

  it("rejects a name that cannot become a slug", async () => {
    const { accessToken } = await register("validation@mobilestore.test");

    const response = await request(app())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "!!" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a second organization whose name produces the same slug", async () => {
    const { accessToken } = await register("duplicate@mobilestore.test");

    const first = await request(app())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Northwind Phones" });
    const second = await request(app())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "northwind phones" });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({
      code: "CONFLICT",
      message: "An organization with this name already exists",
    });
    expect(await client.db().collection(ORGANIZATIONS_COLLECTION).countDocuments({ slug: "northwind-phones" })).toBe(1);
  });
});
