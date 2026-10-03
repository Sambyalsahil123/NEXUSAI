import { ObjectId, type Db } from "mongodb";
import { USERS_COLLECTION, type User } from "../models/user.model.js";

export type NewUserInput = {
  email: string;
  passwordHash: string;
};

export class UserRepository {
  constructor(private readonly db: Db) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.collection().findOne({ email });
  }

  async createUser(input: NewUserInput): Promise<User> {
    const now = new Date();
    const document: User = {
      _id: new ObjectId(),
      email: input.email,
      passwordHash: input.passwordHash,
      emailVerifiedAt: null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await this.collection().insertOne(document);

    return document;
  }

  private collection() {
    return this.db.collection<User>(USERS_COLLECTION);
  }
}
