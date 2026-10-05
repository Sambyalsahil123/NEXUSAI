import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import { normalizeUserEmail, type User } from "../models/user.model.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type { SessionRepository } from "../repositories/session.repository.js";
import type { LoginBody, RegisterBody } from "../validators/auth.validator.js";
import { signAccessToken, verifyAccessToken } from "../utils/access-token.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

const MIN_JWT_SECRET_LENGTH = 32;

export type PublicUser = {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  status: User["status"];
  createdAt: Date;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  status: User["status"];
  createdAt: Date;
};

type UserStore = Pick<UserRepository, "findByEmail" | "findById" | "createUser">;

export type LoginResult = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

type SessionStore = Pick<SessionRepository, "issue" | "claimActive" | "findByRefreshToken" | "revokeFamily" | "revokeIfActive">;

export class AuthService {
  private static dummyPasswordHash: Promise<string> | undefined;

  constructor(
    private readonly users: UserStore,
    private readonly sessions: SessionStore,
    private readonly jwtSecret: string,
  ) {
    if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
      throw new Error("JWT_SECRET must be at least 32 characters");
    }
  }

  async register(input: RegisterBody): Promise<LoginResult> {
    const email = normalizeUserEmail(input.email);
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw emailTaken();
    }

    const passwordHash = await hashPassword(input.password);

    try {
      const user = await this.users.createUser({ email, passwordHash });
      return this.issueSession(user);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw emailTaken();
      }
      throw error;
    }
  }

  async login(input: LoginBody): Promise<LoginResult> {
    const email = normalizeUserEmail(input.email);
    const [user, dummyHash] = await Promise.all([
      this.users.findByEmail(email),
      AuthService.getDummyPasswordHash(),
    ]);
    const passwordMatches = await verifyPassword(input.password, user?.passwordHash ?? dummyHash);

    if (!user || !passwordMatches || user.status !== "active") {
      throw invalidCredentials();
    }

    return this.issueSession(user);
  }

  async refresh(refreshToken: string): Promise<Pick<LoginResult, "accessToken" | "refreshToken">> {
    const claimed = await this.sessions.claimActive(refreshToken);
    if (!claimed) {
      const existing = await this.sessions.findByRefreshToken(refreshToken);
      if (existing?.revokedAt) {
        await this.sessions.revokeFamily(existing.familyId);
      }
      throw invalidRefreshToken();
    }

    const user = await this.users.findById(claimed.userId.toHexString());
    if (!user || user.status !== "active") {
      throw invalidRefreshToken();
    }

    const issued = await this.sessions.issue({ userId: claimed.userId, familyId: claimed.familyId });
    return {
      accessToken: await signAccessToken(user._id.toHexString(), this.jwtSecret),
      refreshToken: issued.refreshToken,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.sessions.revokeIfActive(refreshToken);
  }

  async authenticateAccessToken(token: string): Promise<AuthenticatedUser> {
    let userId: string;
    try {
      userId = await verifyAccessToken(token, this.jwtSecret);
    } catch {
      throw invalidToken();
    }

    const user = await this.users.findById(userId);
    if (!user || user.status !== "active") {
      throw invalidToken();
    }

    return {
      id: user._id.toHexString(),
      email: user.email,
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  private static getDummyPasswordHash(): Promise<string> {
    AuthService.dummyPasswordHash ??= hashPassword("dummy-password-not-a-user-secret");
    return AuthService.dummyPasswordHash;
  }

  private async issueSession(user: User): Promise<LoginResult> {
    const issued = await this.sessions.issue({ userId: user._id });
    return {
      user: toPublicUser(user),
      accessToken: await signAccessToken(user._id.toHexString(), this.jwtSecret),
      refreshToken: issued.refreshToken,
    };
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

function invalidCredentials(): AppError {
  return new AppError(ErrorCodes.UNAUTHORIZED, "Invalid email or password", 401);
}

function invalidToken(): AppError {
  return new AppError(ErrorCodes.UNAUTHORIZED, "Invalid or expired token", 401);
}

function invalidRefreshToken(): AppError {
  return new AppError(ErrorCodes.UNAUTHORIZED, "Invalid or expired refresh token", 401);
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
