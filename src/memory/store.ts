import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config.js";
import { nowIso } from "../text.js";
import type { ChatMemory, ChatSettings, ChatTurn, MemoryDb, MemoryItem, Reminder } from "./types.js";

export class MemoryStore {
  private readonly filePath: string;
  private db: MemoryDb;

  constructor(private readonly config: AppConfig) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    this.filePath = path.join(config.dataDir, "memory.json");
    this.db = this.load();
  }

  getChat(chatId: string): ChatMemory {
    const existing = this.db.chats[chatId];
    if (existing) return existing;

    const created: ChatMemory = {
      settings: this.defaultSettings(),
      short: [],
      items: [],
      reminders: [],
    };
    this.db.chats[chatId] = created;
    this.save();
    return created;
  }

  getSettings(chatId: string): ChatSettings {
    return this.getChat(chatId).settings;
  }

  updateSettings(chatId: string, patch: Partial<ChatSettings>): ChatSettings {
    const chat = this.getChat(chatId);
    chat.settings = { ...chat.settings, ...patch };
    this.save();
    return chat.settings;
  }

  addTurn(chatId: string, turn: ChatTurn): void {
    const chat = this.getChat(chatId);
    chat.short.push(turn);
    chat.short = chat.short.slice(-this.config.memory.shortTurns);
    this.save();
  }

  addMemory(
    chatId: string,
    item: Omit<MemoryItem, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ): MemoryItem {
    const chat = this.getChat(chatId);
    const at = nowIso();
    const created: MemoryItem = {
      id: item.id ?? randomUUID(),
      createdAt: at,
      updatedAt: at,
      ...item,
    };
    chat.items.push(created);
    this.save();
    return created;
  }

  removeMemory(chatId: string, query: string): number {
    const chat = this.getChat(chatId);
    const needle = query.toLowerCase();
    const before = chat.items.length;
    chat.items = chat.items.filter((item) => {
      return item.id !== query && !item.text.toLowerCase().includes(needle);
    });
    const removed = before - chat.items.length;
    if (removed > 0) this.save();
    return removed;
  }

  listMemory(chatId: string, limit = 20): MemoryItem[] {
    return this.getChat(chatId).items
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  addReminder(reminder: Omit<Reminder, "id" | "createdAt">): Reminder {
    const chat = this.getChat(reminder.chatId);
    const created: Reminder = {
      id: randomUUID(),
      createdAt: nowIso(),
      ...reminder,
    };
    chat.reminders.push(created);
    this.save();
    return created;
  }

  dueReminders(now = new Date()): Reminder[] {
    const due: Reminder[] = [];
    for (const chat of Object.values(this.db.chats)) {
      for (const reminder of chat.reminders) {
        if (!reminder.sentAt && new Date(reminder.dueAt).getTime() <= now.getTime()) {
          due.push(reminder);
        }
      }
    }
    return due;
  }

  markReminderSent(chatId: string, reminderId: string): void {
    const chat = this.getChat(chatId);
    const reminder = chat.reminders.find((item) => item.id === reminderId);
    if (reminder) {
      reminder.sentAt = nowIso();
      this.save();
    }
  }

  compact(): void {
    for (const chat of Object.values(this.db.chats)) {
      chat.reminders = chat.reminders.filter((item) => !item.sentAt || Date.now() - new Date(item.sentAt).getTime() < 86400000);
      chat.items = chat.items.slice(-500);
    }
    this.save();
  }

  private defaultSettings(): ChatSettings {
    return {
      triggers: this.config.bot.triggerWords,
      persona: this.config.bot.persona,
      imageEnabled: this.config.image.enabled,
      memoryEnabled: this.config.memory.enabled,
    };
  }

  private load(): MemoryDb {
    if (!fs.existsSync(this.filePath)) {
      return { version: 1, chats: {} };
    }

    const raw = fs.readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as MemoryDb;
    return { version: 1, chats: parsed.chats ?? {} };
  }

  private save(): void {
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }
}
