import { z } from "zod";

export const createKnowledgeBodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Title must be at least 2 characters")
    .max(200, "Title must be at most 200 characters"),
  content: z
    .string()
    .trim()
    .min(1, "Content is required")
    .max(100_000, "Content must be at most 100000 characters"),
  category: z.enum(["policy", "faq", "product"]),
});

export type CreateKnowledgeBody = z.infer<typeof createKnowledgeBodySchema>;
