import type { ILanguageModelService } from "./llm.service.js";
import type { OpenAiApi } from "./openai.client.js";

export class OpenAiLanguageModelService implements ILanguageModelService {
  constructor(
    private readonly client: OpenAiApi,
    private readonly model: string,
  ) {}

  async generateResponse(systemPrompt: string, userQuery: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userQuery },
      ],
    });
    return requireText(response.choices[0]?.message?.content ?? "");
  }

  async generateStream(systemPrompt: string, userQuery: string, onChunk: (token: string) => void): Promise<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userQuery },
      ],
      stream: true,
    });

    let fullText = "";
    for await (const event of stream) {
      const token = event.choices[0]?.delta?.content ?? "";
      if (token.length === 0) {
        continue;
      }
      fullText += token;
      onChunk(token);
    }

    return requireText(fullText);
  }
}

function requireText(text: string): string {
  if (text.trim().length === 0) {
    throw new Error("OpenAI returned an empty chat completion");
  }
  return text;
}
