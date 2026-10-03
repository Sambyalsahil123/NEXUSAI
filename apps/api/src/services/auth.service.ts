import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import { normalizeUserEmail, type User } from "../models/user.model.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type { RegisterBody } from "../validators/auth.validator.js";
import { hashPassword } from "../utils/password.js";

export type PublicUser = {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  status: User["status"];
  createdAt: Date;
};

type UserStore = Pick<UserRepository, "findByEmail" | "createUser">;

export class AuthService {
  constructor(private readonly users: UserStore) {}

  async register(input: RegisterBody): Promise<PublicUser> {
    const email = normalizeUserEmail(input.email);
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw emailTaken();
    }

    const passwordHash = await hashPassword(input.password);

    try {
      const user = await this.users.createUser({ email, passwordHash });
      return toPublicUser(user);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw emailTaken();
      }
      throw error;
    }
  }
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user._id.toHexString(),
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    status: user.status,
    createdAt: user.createdAt,
  };
}

function emailTaken(): AppError {
  return new AppError(ErrorCodes.CONFLICT, "An account with this email already exists", 409);
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
