import { getConfig } from "./config.js";
import { logger } from "./logger.js";
import { MemoryStore } from "./memory/store.js";
import { OpenAiProvider } from "./provider/openai.js";
import { ReminderRunner } from "./reminders.js";
import { createTelegramBot } from "./telegram/bot.js";

const config = getConfig();
const store = new MemoryStore(config);
const ai = new OpenAiProvider(config);
const bot = createTelegramBot(config, store, ai);
const reminders = new ReminderRunner(bot, store, config);

async function main(): Promise<void> {
  const me = await bot.telegram.getMe();
  logger.info(`Starting ${me.username ?? me.first_name}`);
  reminders.start();
  await bot.launch();
  logger.info("Bot is running");
}

function stop(signal: string): void {
  logger.info(`Received ${signal}, stopping`);
  reminders.stop();
  bot.stop(signal);
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

main().catch((error) => {
  logger.error("Fatal startup error", String(error));
  process.exitCode = 1;
});
