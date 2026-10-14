import { ObjectId } from "mongodb";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import type { Membership } from "../models/membership.model.js";
import { slugFromOrganizationName, type Organization } from "../models/organization.model.js";
import type { MembershipRepository } from "../repositories/membership.repository.js";
import type { OrganizationRepository } from "../repositories/organization.repository.js";
import type { CreateOrganizationBody } from "../validators/organization.validator.js";

type OrganizationStore = Pick<OrganizationRepository, "create" | "deleteById" | "findById" | "findByIds">;
type MembershipStore = Pick<MembershipRepository, "create" | "findByUserId" | "findByUserAndOrganization">;

export type PublicOrganization = {
  id: string;
  name: string;
  slug: string;
  status: Organization["status"];
  createdAt: Date;
};

export type PublicMembership = {
  id: string;
  role: Membership["role"];
  status: Membership["status"];
};

export type CreatedOrganization = {
  organization: PublicOrganization;
  membership: PublicMembership;
};

export type UserOrganization = PublicOrganization & {
  role: Membership["role"];
  membershipStatus: Membership["status"];
};

export type TenantContext = {
  organization: PublicOrganization;
  membership: PublicMembership;
};

export class OrganizationService {
  constructor(
    private readonly organizations: OrganizationStore,
    private readonly memberships: MembershipStore,
  ) {}

  async create(userId: string, input: CreateOrganizationBody): Promise<CreatedOrganization> {
    if (!ObjectId.isValid(userId)) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, "Invalid or expired token", 401);
    }

    const slug = slugFromOrganizationName(input.name);
    if (!slug) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Name must include a letter or number", 400);
    }

    const organization = await this.insertOrganization(input.name, slug);

    try {
      const membership = await this.memberships.create({
        userId: new ObjectId(userId),
        organizationId: organization._id,
        role: "owner",
      });

      return {
        organization: toPublicOrganization(organization),
        membership: toPublicMembership(membership),
      };
    } catch (error) {
      await this.removeOrganization(organization._id);
      throw error;
    }
  }

  async getUserOrganizations(userId: string): Promise<UserOrganization[]> {
    if (!ObjectId.isValid(userId)) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, "Invalid or expired token", 401);
    }

    const memberships = await this.memberships.findByUserId(new ObjectId(userId));
    if (memberships.length === 0) {
      return [];
    }

    const organizations = await this.organizations.findByIds(memberships.map((membership) => membership.organizationId));
    const byId = new Map(organizations.map((organization) => [organization._id.toHexString(), organization]));

    return memberships.flatMap((membership) => {
      const organization = byId.get(membership.organizationId.toHexString());
      if (!organization) {
        return [];
      }
      return [
        {
          ...toPublicOrganization(organization),
          role: membership.role,
          membershipStatus: membership.status,
        },
      ];
    });
  }

  async resolveTenant(userId: string, organizationId: string): Promise<TenantContext> {
    if (!ObjectId.isValid(userId)) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, "Invalid or expired token", 401);
    }
    if (!isOrganizationId(organizationId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Organization id is invalid", 400);
    }

    const membership = await this.memberships.findByUserAndOrganization(
      new ObjectId(userId),
      new ObjectId(organizationId),
    );
    const organization = membership ? await this.organizations.findById(membership.organizationId) : null;
    if (!membership || !organization || organization.status !== "active") {
      throw new AppError(ErrorCodes.FORBIDDEN, "You do not have access to this organization", 403);
    }

    return {
      organization: toPublicOrganization(organization),
      membership: toPublicMembership(membership),
    };
  }

  private async insertOrganization(name: string, slug: string): Promise<Organization> {
    try {
      return await this.organizations.create({ name, slug });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw slugTaken();
      }
      throw error;
    }
  }

  private async removeOrganization(id: ObjectId): Promise<void> {
    try {
      await this.organizations.deleteById(id);
    } catch {
      // The membership failure is the error the caller must see.
    }
  }
}

function toPublicMembership(membership: Membership): PublicMembership {
  return {
    id: membership._id.toHexString(),
    role: membership.role,
    status: membership.status,
  };
}

function isOrganizationId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value);
}

function toPublicOrganization(organization: Organization): PublicOrganization {
  return {
    id: organization._id.toHexString(),
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
    createdAt: organization.createdAt,
  };
}

function slugTaken(): AppError {
  return new AppError(ErrorCodes.CONFLICT, "An organization with this name already exists", 409);
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
