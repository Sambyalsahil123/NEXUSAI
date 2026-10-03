import { MongoMemoryServer } from "mongodb-memory-server";
import type { MongoClient } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectMongo, disconnectMongo } from "../src/db/mongo.js";
import { ensureUserIndexes, normalizeUserEmail, USERS_COLLECTION } from "../src/models/user.model.js";

describe("user model", () => {
  let memoryServer: MongoMemoryServer;
  let client: MongoClient;

  beforeAll(async () => {
    memoryServer = await MongoMemoryServer.create();
    client = await connectMongo(memoryServer.getUri());
    await ensureUserIndexes(client.db());
  }, 60_000);

  afterAll(async () => {
    await disconnectMongo(client);
    await memoryServer.stop();
  });

  it("stores email in a comparable form", () => {
    expect(normalizeUserEmail("  Sahil@Nexus.ai ")).toBe("sahil@nexus.ai");
  });

  it("rejects a second user with the same email", async () => {
    const users = client.db().collection(USERS_COLLECTION);
    const now = new Date();
    const doc = {
      email: "owner@mobilestore.test",
      passwordHash: "not-a-real-hash-yet",
      emailVerifiedAt: null,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    };

    await users.insertOne({ ...doc });

    await expect(users.insertOne({ ...doc })).rejects.toMatchObject({ code: 11000 });
  });
});
