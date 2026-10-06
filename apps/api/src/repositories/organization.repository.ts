import { ObjectId, type Db } from "mongodb";
import { ORGANIZATIONS_COLLECTION, type Organization } from "../models/organization.model.js";

export type NewOrganizationInput = {
  name: string;
  slug: string;
};

export class OrganizationRepository {
  constructor(private readonly db: Db) {}

  async findByIds(ids: ObjectId[]): Promise<Organization[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.collection()
      .find({ _id: { $in: ids } })
      .toArray();
  }

  async create(input: NewOrganizationInput): Promise<Organization> {
    const now = new Date();
    const document: Organization = {
      _id: new ObjectId(),
      name: input.name,
      slug: input.slug,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await this.collection().insertOne(document);

    return document;
  }

  async deleteById(id: ObjectId): Promise<void> {
    await this.collection().deleteOne({ _id: id });
  }

  private collection() {
    return this.db.collection<Organization>(ORGANIZATIONS_COLLECTION);
  }
}
