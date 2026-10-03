import { z } from "zod";

export const registerBodySchema = z.object({
  email: z.string().trim().pipe(z.email()),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters")
    .regex(/[A-Za-z]/, "Password must include a letter")
    .regex(/[0-9]/, "Password must include a number"),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
