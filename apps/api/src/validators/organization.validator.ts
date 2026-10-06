import { z } from "zod";

export const createOrganizationBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be at most 80 characters")
    .regex(/[A-Za-z0-9]/, "Name must include a letter or number"),
});

export type CreateOrganizationBody = z.infer<typeof createOrganizationBodySchema>;
