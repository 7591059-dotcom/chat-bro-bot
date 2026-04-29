# Chat Bro Bot

Configurable Telegram group bot with OpenAI-compatible text generation, image generation, layered local memory, and reminders.

## One-Command Server Install

For a fresh Ubuntu/Debian VPS, SSH into the server and run:

```bash
curl -fsSL https://raw.githubusercontent.com/7591059-dotcom/chat-bro-bot/main/install.sh | sudo bash
```

The installer will:

- install system packages, Git, Node.js 22, and npm;
- clone or update this repository in `/opt/chat-bro-bot`;
- ask for the Telegram bot token, AI provider, model id, API key, trigger words, persona, and memory settings;
- write `/opt/chat-bro-bot/.env`;
- build the TypeScript project;
- create a `chat-bro-bot` systemd service with autostart after reboot;
- create an hourly `chat-bro-bot-health.timer` watchdog that restarts the service if it is down;
- ask whether to start the bot immediately.

Supported AI setup paths:

- OpenAI official API with the Responses API.
- Multi-model OpenAI-compatible aggregators, for example OpenRouter or a similar provider that exposes Claude, Gemini, Qwen, OpenAI, and other models through one API key.
- Any custom OpenAI-compatible provider.

Consumer web subscriptions for ChatGPT, Claude, Gemini, Codex, and similar products are not used directly by this bot. Use official API keys or a provider/aggregator that explicitly offers a server API.

## Features

- Trigger words: `бро`, `братан`, `бот`, mentions, or replies to the bot.
- OpenAI Responses API by default, with optional OpenAI-compatible `OPENAI_BASE_URL`.
- Configurable persona and style per chat.
- Image generation through the OpenAI hosted `image_generation` tool.
- Local layered memory: recent turns, facts, people/preferences, episodes, commitments, reminders.
- Reminder parsing for simple Russian phrases like `напомни через 10 минут`, `напомни завтра в 10`, `напомни 30.04 в 18:00`.
- Secret redaction before messages go to the model.
- Per-chat settings stored in `data/memory.json`.

## Quick Start

```bash
cd chat-bro-bot
npm install
copy .env.example .env
npm run build
npm start
```

On PowerShell, use `npm.cmd` if script execution policy blocks `npm`:

```powershell
npm.cmd install
npm.cmd run build
npm.cmd start
```

## Environment

Create `.env` from `.env.example` and fill in:

```env
TELEGRAM_BOT_TOKEN=...
OPENAI_API_KEY=...
AI_MODEL=gpt-5.4-mini
```

For an OpenAI-compatible provider:

```env
OPENAI_BASE_URL=https://provider.example/v1
AI_API_STYLE=chat
```

Use `AI_API_STYLE=responses` for real OpenAI Responses API. Use `chat` only for providers that expose OpenAI-style chat completions but not Responses.

## Telegram Setup

1. Create a bot with BotFather.
2. Copy the bot token into `TELEGRAM_BOT_TOKEN`.
3. Add the bot to your group.
4. If you want it to see ordinary group messages, disable BotFather privacy mode. If privacy remains enabled, use commands, mentions, and replies.

## Commands

```text
/settings
/trigger add бро
/trigger remove бро
/trigger set бро, братан, бот
/style отвечай коротко, тепло и без канцелярита
/remember Саша отвечает за дизайн
/memory
/forget фрагмент или id
/images on
/images off
/memorymode on
/memorymode off
```

## Chat Examples

```text
бро, объясни эту идею проще
бро, запомни, что релизы у нас по пятницам
бро, напомни завтра в 10 проверить билд
бро, нарисуй аватар для нашего проекта
```

## Docker

```bash
docker build -t chat-bro-bot .
docker run --env-file .env -v chat-bro-data:/app/data chat-bro-bot
```

After publishing to GitHub Container Registry, the install command can become:

```bash
docker run --env-file .env -v chat-bro-data:/app/data ghcr.io/OWNER/chat-bro-bot:latest
```

## Memory Design

The bot keeps memory local by default:

- `short`: recent dialogue turns for immediate context.
- `fact`: durable chat facts.
- `person`: user preferences and personal facts.
- `episode`: event-like memories, reserved for future richer learning.
- `summary`: compact chat summaries, reserved for future summarization.
- `commitment`: reminders and promises.

The model receives only a small relevant slice of memory for each answer. API keys and common secret formats are redacted before provider calls.

## Notes

OpenAI's current docs recommend the Responses API for GPT-5-family conversational and agentic work, and list GPT-5.5 as the latest flagship model. This bot defaults to `gpt-5.4-mini` as a cheaper starter model; change `AI_MODEL` and `IMAGE_MODEL` when you want higher quality.
