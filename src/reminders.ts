import type { Telegraf } from "telegraf";
import type { AppConfig } from "./config.js";
import { logger } from "./logger.js";
import type { MemoryStore } from "./memory/store.js";
import type { Reminder } from "./memory/types.js";

interface ParsedReminder {
  dueAt: Date;
  text: string;
}

const RELATIVE = /(?:напомни|напомнить).*?через\s+(\d+)\s*(минут(?:у|ы)?|мин|час(?:а|ов)?|дн(?:я|ей)?|день)\s*(?:,|:|-)?\s*(.*)/i;
const TOMORROW = /(?:напомни|напомнить).*?завтра(?:\s+в\s+(\d{1,2})(?::(\d{2}))?)?\s*(?:,|:|-)?\s*(.*)/i;
const TODAY = /(?:напомни|напомнить).*?сегодня(?:\s+в\s+(\d{1,2})(?::(\d{2}))?)\s*(?:,|:|-)?\s*(.*)/i;
const DATE_TIME = /(?:напомни|напомнить).*?(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?\s+(?:в\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:,|:|-)?\s*(.*)/i;

export function parseReminder(text: string, now = new Date()): ParsedReminder | undefined {
  const relative = text.match(RELATIVE);
  if (relative) {
    const amount = Number.parseInt(relative[1] ?? "0", 10);
    const unit = relative[2] ?? "";
    const dueAt = new Date(now);
    if (unit.startsWith("мин")) dueAt.setMinutes(dueAt.getMinutes() + amount);
    else if (unit.startsWith("час")) dueAt.setHours(dueAt.getHours() + amount);
    else dueAt.setDate(dueAt.getDate() + amount);
    return { dueAt, text: normalizeReminderText(relative[3]) };
  }

  const tomorrow = text.match(TOMORROW);
  if (tomorrow) {
    const dueAt = new Date(now);
    dueAt.setDate(dueAt.getDate() + 1);
    dueAt.setHours(Number.parseInt(tomorrow[1] ?? "9", 10), Number.parseInt(tomorrow[2] ?? "0", 10), 0, 0);
    return { dueAt, text: normalizeReminderText(tomorrow[3]) };
  }

  const today = text.match(TODAY);
  if (today) {
    const dueAt = new Date(now);
    dueAt.setHours(Number.parseInt(today[1] ?? "9", 10), Number.parseInt(today[2] ?? "0", 10), 0, 0);
    if (dueAt.getTime() <= now.getTime()) dueAt.setDate(dueAt.getDate() + 1);
    return { dueAt, text: normalizeReminderText(today[3]) };
  }

  const absolute = text.match(DATE_TIME);
  if (absolute) {
    const day = Number.parseInt(absolute[1] ?? "1", 10);
    const month = Number.parseInt(absolute[2] ?? "1", 10) - 1;
    const rawYear = absolute[3] ? Number.parseInt(absolute[3], 10) : now.getFullYear();
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const hour = Number.parseInt(absolute[4] ?? "9", 10);
    const minute = Number.parseInt(absolute[5] ?? "0", 10);
    return { dueAt: new Date(year, month, day, hour, minute, 0, 0), text: normalizeReminderText(absolute[6]) };
  }

  return undefined;
}

export class ReminderRunner {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly bot: Telegraf,
    private readonly store: MemoryStore,
    private readonly config: AppConfig,
  ) {}

  start(): void {
    if (!this.config.reminders.enabled) return;
    this.timer = setInterval(() => void this.tick(), this.config.reminders.checkSeconds * 1000);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    const due = this.store.dueReminders();
    for (const reminder of due) {
      await this.send(reminder);
    }
    this.store.compact();
  }

  private async send(reminder: Reminder): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(reminder.chatId, `${reminder.userName}, напоминаю: ${reminder.text}`);
      this.store.markReminderSent(reminder.chatId, reminder.id);
    } catch (error) {
      logger.warn("Failed to send reminder", { reminderId: reminder.id, error: String(error) });
    }
  }
}

function normalizeReminderText(value?: string): string {
  const text = value?.trim().replace(/^[:,-]\s*/, "").replace(/^что\s+/i, "");
  return text || "пора вернуться к этому";
}
