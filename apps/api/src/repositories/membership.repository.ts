import { ObjectId, type Db } from "mongodb";
import { MEMBERSHIPS_COLLECTION, type Membership, type MembershipRole } from "../models/membership.model.js";

export type NewMembershipInput = {
  userId: ObjectId;
  organizationId: ObjectId;
  role: MembershipRole;
};

export class MembershipRepository {
  constructor(private readonly db: Db) {}

  async findByUserId(userId: ObjectId): Promise<Membership[]> {
    return this.collection().find({ userId }).sort({ createdAt: 1 }).toArray();
  }

  async create(input: NewMembershipInput): Promise<Membership> {
    const now = new Date();
    const document: Membership = {
      _id: new ObjectId(),
      userId: input.userId,
      organizationId: input.organizationId,
      role: input.role,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await this.collection().insertOne(document);

    return document;
  }

  private collection() {
    return this.db.collection<Membership>(MEMBERSHIPS_COLLECTION);
  }
}
