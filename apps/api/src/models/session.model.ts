import { createHash, randomBytes } from "node:crypto";
import type { Db, IndexSpecification, ObjectId } from "mongodb";

export const SESSIONS_COLLECTION = "sessions";

/** Seven days. The access token stays at 15 minutes. */
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Session = {
  _id: ObjectId;
  userId: ObjectId;
  familyId: ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: ObjectId | null;
  createdAt: Date;
};

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function ensureSessionIndexes(db: Db): Promise<void> {
  const sessions = db.collection<Session>(SESSIONS_COLLECTION);
  const tokenHash: IndexSpecification = { tokenHash: 1 };
  const expiresAt: IndexSpecification = { expiresAt: 1 };
  const familyId: IndexSpecification = { familyId: 1 };

  await sessions.createIndex(tokenHash, { unique: true, name: "sessions_token_hash_unique" });
  await sessions.createIndex(expiresAt, { expireAfterSeconds: 0, name: "sessions_expires_at_ttl" });
  await sessions.createIndex(familyId, { name: "sessions_family_id" });
}
