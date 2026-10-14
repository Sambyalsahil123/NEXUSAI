import type { AuthenticatedUser } from "../services/auth.service.js";
import type { PublicMembership, PublicOrganization } from "../services/organization.service.js";

export type ValidatedRequest = {
  body?: unknown;
  query?: unknown;
  params?: unknown;
};

declare global {
  namespace Express {
    interface Request {
      validated?: ValidatedRequest;
      user?: AuthenticatedUser;
      organization?: PublicOrganization;
      membership?: PublicMembership;
    }
  }
}
