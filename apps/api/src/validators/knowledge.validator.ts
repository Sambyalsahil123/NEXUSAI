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

export const searchKnowledgeBodySchema = z.object({
  query: z.string().trim().min(1, "Query is required").max(1_000, "Query must be at most 1000 characters"),
  limit: z.number().int().min(1).max(20).optional(),
});

export type SearchKnowledgeBody = z.infer<typeof searchKnowledgeBodySchema>;

export const askKnowledgeBodySchema = z.object({
  question: z.string().trim().min(1, "Question is required").max(1_000, "Question must be at most 1000 characters"),
});

export type AskKnowledgeBody = z.infer<typeof askKnowledgeBodySchema>;
