import { MongoMemoryServer } from "mongodb-memory-server";
import { ObjectId, type MongoClient } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectMongo, disconnectMongo } from "../src/db/mongo.js";
import { MEMBERSHIPS_COLLECTION, ensureMembershipIndexes } from "../src/models/membership.model.js";
import {
  ORGANIZATIONS_COLLECTION,
  ensureOrganizationIndexes,
  normalizeOrganizationSlug,
} from "../src/models/organization.model.js";

describe("organization and membership models", () => {
  let memoryServer: MongoMemoryServer;
  let client: MongoClient;

  beforeAll(async () => {
    memoryServer = await MongoMemoryServer.create();
    client = await connectMongo(memoryServer.getUri());
    await ensureOrganizationIndexes(client.db());
    await ensureMembershipIndexes(client.db());
  }, 60_000);

  afterAll(async () => {
    await disconnectMongo(client);
    await memoryServer.stop();
  });

  it("stores a slug in a comparable form", () => {
    expect(normalizeOrganizationSlug("  Mobile-Store ")).toBe("mobile-store");
  });

  it("rejects a second organization with the same slug", async () => {
    const organizations = client.db().collection(ORGANIZATIONS_COLLECTION);
    const now = new Date();
    const doc = {
      name: "Mobile Store",
      slug: "mobile-store",
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    };

    await organizations.insertOne({ ...doc });

    await expect(organizations.insertOne({ ...doc, name: "Another Mobile Store" })).rejects.toMatchObject({
      code: 11000,
    });
  });

  it("rejects a second membership for the same user and organization", async () => {
    const memberships = client.db().collection(MEMBERSHIPS_COLLECTION);
    const now = new Date();
    const userId = new ObjectId();
    const organizationId = new ObjectId();
    const doc = {
      userId,
      organizationId,
      role: "admin" as const,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    };

    await memberships.insertOne({ ...doc });

    await expect(memberships.insertOne({ ...doc, role: "agent" })).rejects.toMatchObject({ code: 11000 });
  });

  it("allows the same user in two organizations and two users in one organization", async () => {
    const memberships = client.db().collection(MEMBERSHIPS_COLLECTION);
    const now = new Date();
    const userId = new ObjectId();
    const otherUserId = new ObjectId();
    const firstOrganizationId = new ObjectId();
    const secondOrganizationId = new ObjectId();

    await memberships.insertOne({
      userId,
      organizationId: firstOrganizationId,
      role: "owner",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await memberships.insertOne({
      userId,
      organizationId: secondOrganizationId,
      role: "agent",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await memberships.insertOne({
      userId: otherUserId,
      organizationId: firstOrganizationId,
      role: "admin",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const forUser = await memberships.countDocuments({ userId });
    const forOrganization = await memberships.countDocuments({ organizationId: firstOrganizationId });

    expect(forUser).toBe(2);
    expect(forOrganization).toBe(2);
  });
});
