import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv();

type ApiStyle = "responses" | "chat";

export interface AppConfig {
  telegramToken: string;
  dataDir: string;
  adminUserIds: Set<number>;
  bot: {
    name: string;
    language: string;
    persona: string;
    triggerWords: string[];
    maxReplyChars: number;
  };
  ai: {
    apiKey: string;
    baseUrl?: string;
    apiStyle: ApiStyle;
    model: string;
    reasoningEffort: "none" | "low" | "medium" | "high" | "xhigh";
    verbosity: "low" | "medium" | "high";
  };
  image: {
    enabled: boolean;
    model: string;
    size: string;
    quality: "low" | "medium" | "high" | "auto";
  };
  memory: {
    enabled: boolean;
    learnFromUntriggered: boolean;
    maxContextItems: number;
    shortTurns: number;
  };
  reminders: {
    enabled: boolean;
    checkSeconds: number;
  };
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function required(name: string): string {
  const value = optional(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const value = optional(name);
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function int(name: string, fallback: number): number {
  const value = optional(name);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function csv(name: string, fallback: string[]): string[] {
  const value = optional(name);
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function userIdSet(name: string): Set<number> {
  return new Set(
    csv(name, [])
      .map((item) => Number.parseInt(item, 10))
      .filter((item) => Number.isFinite(item)),
  );
}

function oneOf<T extends string>(name: string, fallback: T, allowed: readonly T[]): T {
  const value = optional(name) as T | undefined;
  return value && allowed.includes(value) ? value : fallback;
}

export function getConfig(): AppConfig {
  const dataDir = optional("DATA_DIR") ?? "./data";

  return {
    telegramToken: required("TELEGRAM_BOT_TOKEN"),
    dataDir: path.resolve(dataDir),
    adminUserIds: userIdSet("ADMIN_USER_IDS"),
    bot: {
      name: optional("BOT_NAME") ?? "Бро",
      language: optional("BOT_LANGUAGE") ?? "ru",
      persona:
        optional("BOT_PERSONA") ??
        "Ты дружелюбный помощник в общем чате. Отвечай по-русски, живо, коротко и по делу.",
      triggerWords: csv("TRIGGER_WORDS", ["бро", "братан", "бот"]),
      maxReplyChars: int("MAX_REPLY_CHARS", 3500),
    },
    ai: {
      apiKey: required("OPENAI_API_KEY"),
      baseUrl: optional("OPENAI_BASE_URL"),
      apiStyle: oneOf<ApiStyle>("AI_API_STYLE", "responses", ["responses", "chat"]),
      model: optional("AI_MODEL") ?? "gpt-5.4-mini",
      reasoningEffort: oneOf("AI_REASONING_EFFORT", "low", ["none", "low", "medium", "high", "xhigh"]),
      verbosity: oneOf("AI_VERBOSITY", "low", ["low", "medium", "high"]),
    },
    image: {
      enabled: bool("IMAGE_ENABLED", true),
      model: optional("IMAGE_MODEL") ?? "gpt-5.4-mini",
      size: optional("IMAGE_SIZE") ?? "1024x1024",
      quality: oneOf("IMAGE_QUALITY", "medium", ["low", "medium", "high", "auto"]),
    },
    memory: {
      enabled: bool("MEMORY_ENABLED", true),
      learnFromUntriggered: bool("MEMORY_LEARN_FROM_UNTRIGGERED", false),
      maxContextItems: int("MEMORY_MAX_CONTEXT_ITEMS", 12),
      shortTurns: int("MEMORY_SHORT_TURNS", 24),
    },
    reminders: {
      enabled: bool("REMINDERS_ENABLED", true),
      checkSeconds: int("REMINDER_CHECK_SECONDS", 30),
    },
  };
}
