import OpenAI from "openai";
import type { AppConfig } from "../config.js";
import { redactSecrets, truncate } from "../text.js";

export interface AiMessage {
  role: "user" | "assistant";
  name: string;
  text: string;
}

export interface TextRequest {
  instructions: string;
  messages: AiMessage[];
}

export interface ImageResult {
  image: Buffer;
  revisedPrompt?: string;
}

export class OpenAiProvider {
  private readonly client: OpenAI;

  constructor(private readonly config: AppConfig) {
    this.client = new OpenAI({
      apiKey: config.ai.apiKey,
      baseURL: config.ai.baseUrl,
    });
  }

  async text(request: TextRequest): Promise<string> {
    if (this.config.ai.apiStyle === "chat") {
      return this.chatText(request);
    }

    const input = request.messages.map((message) => ({
      role: message.role,
      content: `${message.name}: ${redactSecrets(message.text)}`,
    }));

    const response = await this.client.responses.create({
      model: this.config.ai.model,
      reasoning: { effort: this.config.ai.reasoningEffort },
      text: { verbosity: this.config.ai.verbosity },
      instructions: request.instructions,
      input,
      store: false,
    } as never);

    return truncate((response as { output_text?: string }).output_text?.trim() || "", this.config.bot.maxReplyChars);
  }

  async image(prompt: string): Promise<ImageResult> {
    const response = await this.client.responses.create({
      model: this.config.image.model,
      input: redactSecrets(prompt),
      tools: [
        {
          type: "image_generation",
          size: this.config.image.size,
          quality: this.config.image.quality,
        },
      ],
      tool_choice: { type: "image_generation" },
      store: false,
    } as never);

    const outputs = (response as unknown as { output?: Array<Record<string, unknown>> }).output ?? [];
    const imageCall = outputs.find((output) => output.type === "image_generation_call");
    const base64 = imageCall?.result;

    if (typeof base64 !== "string") {
      throw new Error("Image generation returned no image data.");
    }

    return {
      image: Buffer.from(base64, "base64"),
      revisedPrompt: typeof imageCall?.revised_prompt === "string" ? imageCall.revised_prompt : undefined,
    };
  }

  private async chatText(request: TextRequest): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.config.ai.model,
      messages: [
        { role: "system", content: request.instructions },
        ...request.messages.map((message) => ({
          role: message.role as "user" | "assistant",
          content: `${message.name}: ${redactSecrets(message.text)}`,
        })),
      ],
    });

    return truncate(response.choices[0]?.message?.content?.trim() ?? "", this.config.bot.maxReplyChars);
  }
}
