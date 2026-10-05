import { ObjectId, type Db } from "mongodb";
import {
  REFRESH_TOKEN_TTL_MS,
  SESSIONS_COLLECTION,
  generateRefreshToken,
  hashRefreshToken,
  type Session,
} from "../models/session.model.js";

export type IssuedRefreshToken = {
  refreshToken: string;
  session: Session;
};

export class SessionRepository {
  constructor(private readonly db: Db) {}

  async issue(input: { userId: ObjectId; familyId?: ObjectId }): Promise<IssuedRefreshToken> {
    const now = new Date();
    const _id = new ObjectId();
    const refreshToken = generateRefreshToken();
    const session: Session = {
      _id,
      userId: input.userId,
      familyId: input.familyId ?? _id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      revokedAt: null,
      replacedBy: null,
      createdAt: now,
    };
    await this.collection().insertOne(session);
    return { refreshToken, session };
  }

  async claimActive(refreshToken: string): Promise<Session | null> {
    const now = new Date();
    const replacedBy = new ObjectId();
    return this.collection().findOneAndUpdate(
      {
        tokenHash: hashRefreshToken(refreshToken),
        revokedAt: null,
        expiresAt: { $gt: now },
      },
      { $set: { revokedAt: now, replacedBy } },
      { returnDocument: "before" },
    );
  }

  async findByRefreshToken(refreshToken: string): Promise<Session | null> {
    return this.collection().findOne({ tokenHash: hashRefreshToken(refreshToken) });
  }

  async revokeFamily(familyId: ObjectId): Promise<void> {
    await this.collection().updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }

  async revokeIfActive(refreshToken: string): Promise<void> {
    await this.collection().updateOne(
      { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }

  private collection() {
    return this.db.collection<Session>(SESSIONS_COLLECTION);
  }
}
