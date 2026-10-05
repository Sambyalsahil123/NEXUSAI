import { MongoMemoryServer } from "mongodb-memory-server";
import type { MongoClient } from "mongodb";
import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectMongo, disconnectMongo } from "../src/db/mongo.js";
import { ensureSessionIndexes } from "../src/models/session.model.js";
import { USERS_COLLECTION, ensureUserIndexes } from "../src/models/user.model.js";
import { UserRepository } from "../src/repositories/user.repository.js";
import { SessionRepository } from "../src/repositories/session.repository.js";
import { AuthService } from "../src/services/auth.service.js";
import { HealthService } from "../src/services/health.service.js";
import { createLogger } from "../src/utils/logger.js";

const JWT_SECRET = "test-jwt-secret-that-is-32-characters-long";

describe("GET /api/v1/auth/me", () => {
  let memoryServer: MongoMemoryServer;
  let client: MongoClient;

  beforeAll(async () => {
    memoryServer = await MongoMemoryServer.create();
    client = await connectMongo(memoryServer.getUri());
    await ensureUserIndexes(client.db());
    await ensureSessionIndexes(client.db());
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
      logger: createLogger("silent"),
      corsOrigin: "http://localhost:3000",
    });
  }

  async function registerAndLogin(email: string) {
    await request(app()).post("/api/v1/auth/register").send({ email, password: "horse1234" });
    const login = await request(app()).post("/api/v1/auth/login").send({ email, password: "horse1234" });
    return {
      token: login.body.data.accessToken as string,
      userId: login.body.data.user.id as string,
    };
  }

  it("rejects a request with no token", async () => {
    const response = await request(app()).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error).toEqual({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  });

  it("rejects an invalid token and an expired token", async () => {
    const { userId } = await registerAndLogin("expired@mobilestore.test");
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt(now - 120)
      .setExpirationTime(now - 60)
      .sign(new TextEncoder().encode(JWT_SECRET));

    const invalid = await request(app()).get("/api/v1/auth/me").set("Authorization", "Bearer not-a-token");
    const past = await request(app()).get("/api/v1/auth/me").set("Authorization", `Bearer ${expired}`);

    expect(invalid.status).toBe(401);
    expect(past.status).toBe(401);
    expect(invalid.body.error.message).toBe("Invalid or expired token");
    expect(past.body.error).toEqual(invalid.body.error);
  });

  it("returns the active user for a valid token", async () => {
    const { token } = await registerAndLogin("active@mobilestore.test");
    const response = await request(app()).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      email: "active@mobilestore.test",
      status: "active",
    });
    expect(response.body.data.passwordHash).toBeUndefined();
    expect(response.body.data.id).toEqual(expect.any(String));
    expect(response.body.data.createdAt).toEqual(expect.any(String));
  });

  it("rejects a valid token after the user is disabled or deleted", async () => {
    const disabled = await registerAndLogin("disabled@mobilestore.test");
    const deleted = await registerAndLogin("deleted@mobilestore.test");
    const users = client.db().collection(USERS_COLLECTION);

    await users.updateOne({ email: "disabled@mobilestore.test" }, { $set: { status: "disabled" } });
    await users.deleteOne({ email: "deleted@mobilestore.test" });

    const disabledResponse = await request(app())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${disabled.token}`);
    const deletedResponse = await request(app())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${deleted.token}`);

    expect(disabledResponse.status).toBe(401);
    expect(deletedResponse.status).toBe(401);
    expect(disabledResponse.body.error.message).toBe("Invalid or expired token");
    expect(deletedResponse.body.error).toEqual(disabledResponse.body.error);
  });
});
