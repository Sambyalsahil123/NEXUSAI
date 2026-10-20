import { z } from "zod";

export const createConversationBodySchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title must be at most 120 characters").optional(),
  channel: z.enum(["widget", "api"]).optional(),
});

export type CreateConversationBody = z.infer<typeof createConversationBodySchema>;

export const conversationParamsSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Conversation id is invalid"),
});

export const postMessageBodySchema = z.object({
  content: z.string().trim().min(1, "Message is required").max(1_000, "Message must be at most 1000 characters"),
});

export type PostMessageBody = z.infer<typeof postMessageBodySchema>;
