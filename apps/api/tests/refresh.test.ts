import { MongoMemoryServer } from "mongodb-memory-server";
import type { MongoClient } from "mongodb";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectMongo, disconnectMongo } from "../src/db/mongo.js";
import { SESSIONS_COLLECTION, ensureSessionIndexes, hashRefreshToken } from "../src/models/session.model.js";
import { ensureUserIndexes } from "../src/models/user.model.js";
import { SessionRepository } from "../src/repositories/session.repository.js";
import { UserRepository } from "../src/repositories/user.repository.js";
import { AuthService } from "../src/services/auth.service.js";
import { HealthService } from "../src/services/health.service.js";
import { createLogger } from "../src/utils/logger.js";

const JWT_SECRET = "test-jwt-secret-that-is-32-characters-long";

describe("refresh tokens and logout", () => {
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

  async function login(email: string) {
    await request(app()).post("/api/v1/auth/register").send({ email, password: "horse1234" });
    const response = await request(app()).post("/api/v1/auth/login").send({ email, password: "horse1234" });
    return response.body.data.refreshToken as string;
  }

  it("rotates a valid refresh token", async () => {
    const refreshToken = await login("refresh@mobilestore.test");
    const response = await request(app()).post("/api/v1/auth/refresh").send({ refreshToken });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken.split(".")).toHaveLength(3);
    expect(response.body.data.refreshToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).not.toBe(refreshToken);
  });

  it("rejects an unknown refresh token and an expired one", async () => {
    const refreshToken = await login("expired-refresh@mobilestore.test");
    await client
      .db()
      .collection(SESSIONS_COLLECTION)
      .updateOne({ tokenHash: hashRefreshToken(refreshToken) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const unknown = await request(app())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "this-token-was-never-issued-anywhere" });
    const expired = await request(app()).post("/api/v1/auth/refresh").send({ refreshToken });

    expect(unknown.status).toBe(401);
    expect(expired.status).toBe(401);
    expect(unknown.body.error.message).toBe("Invalid or expired refresh token");
    expect(expired.body.error).toEqual(unknown.body.error);
  });

  it("revokes the family when a rotated refresh token is presented again", async () => {
    const original = await login("reuse@mobilestore.test");
    const rotated = await request(app()).post("/api/v1/auth/refresh").send({ refreshToken: original });
    const reused = await request(app()).post("/api/v1/auth/refresh").send({ refreshToken: original });
    const successor = await request(app())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: rotated.body.data.refreshToken });

    expect(rotated.status).toBe(200);
    expect(reused.status).toBe(401);
    expect(successor.status).toBe(401);
  });

  it("rejects a refresh token after logout", async () => {
    const refreshToken = await login("logout@mobilestore.test");
    const logout = await request(app()).post("/api/v1/auth/logout").send({ refreshToken });
    const refresh = await request(app()).post("/api/v1/auth/refresh").send({ refreshToken });

    expect(logout.status).toBe(200);
    expect(logout.body.data).toEqual({ revoked: true });
    expect(refresh.status).toBe(401);
    expect(refresh.body.error.code).toBe("UNAUTHORIZED");
  });
});
