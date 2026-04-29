#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${CHAT_BRO_REPO_URL:-https://github.com/7591059-dotcom/chat-bro-bot.git}"
APP_DIR="${CHAT_BRO_APP_DIR:-/opt/chat-bro-bot}"
BRANCH="${CHAT_BRO_BRANCH:-main}"
SERVICE_NAME="${CHAT_BRO_SERVICE_NAME:-chat-bro-bot}"
SERVICE_USER="${CHAT_BRO_SERVICE_USER:-chatbrobot}"
NODE_MAJOR_REQUIRED=22

if [[ -r /dev/tty && -w /dev/tty ]]; then
  exec 3<>/dev/tty
else
  exec 3<&0
fi

log() {
  printf "\033[1;32m[chat-bro]\033[0m %s\n" "$*"
}

warn() {
  printf "\033[1;33m[chat-bro]\033[0m %s\n" "$*"
}

die() {
  printf "\033[1;31m[chat-bro]\033[0m %s\n" "$*" >&2
  exit 1
}

prompt() {
  local label="$1"
  local default_value="${2:-}"
  local value

  if [[ -n "$default_value" ]]; then
    printf "%s [%s]: " "$label" "$default_value" >&3
  else
    printf "%s: " "$label" >&3
  fi

  IFS= read -r value <&3 || value=""
  if [[ -z "$value" ]]; then
    printf "%s" "$default_value"
  else
    printf "%s" "$value"
  fi
}

prompt_secret() {
  local label="$1"
  local value

  printf "%s: " "$label" >&3
  IFS= read -rs value <&3 || value=""
  printf "\n" >&3
  printf "%s" "$value"
}

confirm() {
  local label="$1"
  local default_value="${2:-yes}"
  local suffix="[Y/n]"
  local value

  if [[ "$default_value" == "no" ]]; then
    suffix="[y/N]"
  fi

  printf "%s %s " "$label" "$suffix" >&3
  IFS= read -r value <&3 || value=""
  value="$(printf "%s" "$value" | tr '[:upper:]' '[:lower:]')"

  if [[ -z "$value" ]]; then
    [[ "$default_value" == "yes" ]]
    return
  fi

  [[ "$value" == "y" || "$value" == "yes" || "$value" == "д" || "$value" == "да" ]]
}

env_quote() {
  local value="$1"
  value="${value//$'\r'/}"
  value="${value//$'\n'/ }"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf "\"%s\"" "$value"
}

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    die "Run as root: curl -fsSL https://raw.githubusercontent.com/7591059-dotcom/chat-bro-bot/main/install.sh | sudo bash"
  fi
}

require_linux() {
  [[ "$(uname -s)" == "Linux" ]] || die "This installer supports Linux servers only."
  command -v systemctl >/dev/null 2>&1 || die "systemd is required."
  command -v apt-get >/dev/null 2>&1 || die "This installer currently supports Ubuntu/Debian with apt."
}

install_base_packages() {
  log "Installing base packages..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl git gnupg
}

node_major() {
  if ! command -v node >/dev/null 2>&1; then
    printf "0"
    return
  fi
  node -v | sed -E 's/^v([0-9]+).*/\1/'
}

install_node() {
  local current_major
  current_major="$(node_major)"

  if [[ "$current_major" =~ ^[0-9]+$ && "$current_major" -ge "$NODE_MAJOR_REQUIRED" ]]; then
    log "Node.js $(node -v) is already installed."
    return
  fi

  log "Installing Node.js ${NODE_MAJOR_REQUIRED}.x..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR_REQUIRED}.x" | bash -
  apt-get install -y nodejs
  node -v
  npm -v
}

sync_repo() {
  log "Preparing application directory: ${APP_DIR}"

  if [[ -d "${APP_DIR}/.git" ]]; then
    log "Existing repository found. Fetching latest ${BRANCH}..."
    git -C "$APP_DIR" fetch origin "$BRANCH"

    if [[ -n "$(git -C "$APP_DIR" status --porcelain)" ]]; then
      warn "Local source changes were found in ${APP_DIR}."
      if ! confirm "Overwrite local source files with GitHub version?" "no"; then
        die "Installation stopped to keep existing files untouched."
      fi
    fi

    git -C "$APP_DIR" checkout "$BRANCH"
    git -C "$APP_DIR" reset --hard "origin/${BRANCH}"
  else
    mkdir -p "$(dirname "$APP_DIR")"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  fi
}

create_service_user() {
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    log "Service user ${SERVICE_USER} already exists."
  else
    log "Creating service user ${SERVICE_USER}..."
    useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
  fi
}

install_app() {
  log "Installing Node dependencies and building the bot..."
  cd "$APP_DIR"

  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi

  npm run build
  npm prune --omit=dev
  mkdir -p "${APP_DIR}/data"
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}/data"
}

select_provider() {
  local choice

  printf "\nAI provider:\n" >&3
  printf "  1) OpenAI official API, Responses API\n" >&3
  printf "  2) Multi-model aggregator, OpenAI-compatible API (OpenRouter, ClaudeHub, etc.)\n" >&3
  printf "  3) Custom OpenAI-compatible provider\n" >&3

  choice="$(prompt "Choose provider" "1")"

  case "$choice" in
    1)
      AI_BASE_URL=""
      AI_API_STYLE="responses"
      AI_MODEL="$(prompt "Model" "gpt-5.4-mini")"
      IMAGE_ENABLED_DEFAULT="true"
      IMAGE_MODEL_DEFAULT="$AI_MODEL"
      ;;
    2)
      AI_BASE_URL="$(prompt "Provider base URL" "https://openrouter.ai/api/v1")"
      AI_API_STYLE="chat"
      AI_MODEL="$(prompt "Model id from provider" "openai/gpt-5.4-mini")"
      IMAGE_ENABLED_DEFAULT="false"
      IMAGE_MODEL_DEFAULT="$AI_MODEL"
      ;;
    3)
      AI_BASE_URL="$(prompt "Provider base URL, for example https://provider.example/v1" "")"
      [[ -n "$AI_BASE_URL" ]] || die "Provider base URL is required for custom provider."
      AI_API_STYLE="$(prompt "API style: chat or responses" "chat")"
      if [[ "$AI_API_STYLE" != "chat" && "$AI_API_STYLE" != "responses" ]]; then
        die "AI_API_STYLE must be chat or responses."
      fi
      AI_MODEL="$(prompt "Model id" "")"
      [[ -n "$AI_MODEL" ]] || die "Model id is required."
      IMAGE_ENABLED_DEFAULT="false"
      IMAGE_MODEL_DEFAULT="$AI_MODEL"
      ;;
    *)
      die "Unknown provider choice."
      ;;
  esac
}

write_env_file() {
  local env_file="${APP_DIR}/.env"
  local backup_file
  local telegram_token
  local api_key
  local bot_name
  local trigger_words
  local bot_persona
  local admin_user_ids
  local image_enabled
  local memory_untriggered

  if [[ -f "$env_file" ]]; then
    if confirm "Existing .env found. Keep it and skip configuration wizard?" "yes"; then
      chmod 600 "$env_file"
      return
    fi

    backup_file="${env_file}.backup.$(date +%Y%m%d%H%M%S)"
    cp "$env_file" "$backup_file"
    chmod 600 "$backup_file"
    log "Backup saved: ${backup_file}"
  fi

  printf "\nTelegram:\n" >&3
  telegram_token="$(prompt_secret "TELEGRAM_BOT_TOKEN from BotFather")"
  [[ -n "$telegram_token" ]] || die "TELEGRAM_BOT_TOKEN is required."

  select_provider
  api_key="$(prompt_secret "AI provider API key")"
  [[ -n "$api_key" ]] || die "AI provider API key is required."

  printf "\nBot behavior:\n" >&3
  bot_name="$(prompt "Bot display name" "Бро")"
  trigger_words="$(prompt "Trigger words, comma-separated" "бро,братан,бот")"
  bot_persona="$(prompt "Answer style/persona" "Ты дружелюбный помощник в общем чате. Отвечай по-русски, живо, коротко и по делу.")"
  admin_user_ids="$(prompt "Admin Telegram user IDs, comma-separated, empty = group admins" "")"

  printf "\nFeatures:\n" >&3
  if confirm "Enable image generation?" "$([[ "$IMAGE_ENABLED_DEFAULT" == "true" ]] && printf "yes" || printf "no")"; then
    image_enabled="true"
  else
    image_enabled="false"
  fi

  if confirm "Learn memory from ordinary untriggered chat messages?" "no"; then
    memory_untriggered="true"
  else
    memory_untriggered="false"
  fi

  {
    printf "# Generated by chat-bro-bot install.sh on %s\n" "$(date -Is)"
    printf "\n# Telegram\n"
    printf "TELEGRAM_BOT_TOKEN=%s\n" "$(env_quote "$telegram_token")"
    printf "\n# AI provider\n"
    printf "OPENAI_API_KEY=%s\n" "$(env_quote "$api_key")"
    printf "OPENAI_BASE_URL=%s\n" "$(env_quote "$AI_BASE_URL")"
    printf "AI_API_STYLE=%s\n" "$(env_quote "$AI_API_STYLE")"
    printf "AI_MODEL=%s\n" "$(env_quote "$AI_MODEL")"
    printf "AI_REASONING_EFFORT=%s\n" "$(env_quote "low")"
    printf "AI_VERBOSITY=%s\n" "$(env_quote "low")"
    printf "\n# Optional image generation\n"
    printf "IMAGE_ENABLED=%s\n" "$(env_quote "$image_enabled")"
    printf "IMAGE_MODEL=%s\n" "$(env_quote "$IMAGE_MODEL_DEFAULT")"
    printf "IMAGE_SIZE=%s\n" "$(env_quote "1024x1024")"
    printf "IMAGE_QUALITY=%s\n" "$(env_quote "medium")"
    printf "\n# Bot behavior\n"
    printf "BOT_NAME=%s\n" "$(env_quote "$bot_name")"
    printf "BOT_LANGUAGE=%s\n" "$(env_quote "ru")"
    printf "BOT_PERSONA=%s\n" "$(env_quote "$bot_persona")"
    printf "TRIGGER_WORDS=%s\n" "$(env_quote "$trigger_words")"
    printf "MAX_REPLY_CHARS=%s\n" "$(env_quote "3500")"
    printf "\n# Memory\n"
    printf "MEMORY_ENABLED=%s\n" "$(env_quote "true")"
    printf "MEMORY_LEARN_FROM_UNTRIGGERED=%s\n" "$(env_quote "$memory_untriggered")"
    printf "MEMORY_MAX_CONTEXT_ITEMS=%s\n" "$(env_quote "12")"
    printf "MEMORY_SHORT_TURNS=%s\n" "$(env_quote "24")"
    printf "DATA_DIR=%s\n" "$(env_quote "${APP_DIR}/data")"
    printf "\n# Reminders\n"
    printf "REMINDERS_ENABLED=%s\n" "$(env_quote "true")"
    printf "REMINDER_CHECK_SECONDS=%s\n" "$(env_quote "30")"
    printf "\n# Admins\n"
    printf "ADMIN_USER_IDS=%s\n" "$(env_quote "$admin_user_ids")"
  } > "$env_file"

  chmod 600 "$env_file"
  chown root:root "$env_file"
}

write_systemd_units() {
  local node_path
  node_path="$(command -v node)"

  log "Writing systemd service and hourly health timer..."

  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Chat Bro Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${node_path} ${APP_DIR}/dist/index.js
Restart=always
RestartSec=10
User=${SERVICE_USER}
Group=${SERVICE_USER}
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=${APP_DIR}/data
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

  cat > "/etc/systemd/system/${SERVICE_NAME}-health.service" <<EOF
[Unit]
Description=Chat Bro Bot hourly health check

[Service]
Type=oneshot
ExecStart=/bin/bash -lc 'systemctl is-active --quiet ${SERVICE_NAME}.service || systemctl restart ${SERVICE_NAME}.service'
EOF

  cat > "/etc/systemd/system/${SERVICE_NAME}-health.timer" <<EOF
[Unit]
Description=Run Chat Bro Bot health check every hour

[Timer]
OnBootSec=5min
OnUnitActiveSec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF

  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}.service"
  systemctl enable "${SERVICE_NAME}-health.timer"
}

start_or_finish() {
  printf "\n" >&3
  if confirm "Start the bot now?" "yes"; then
    systemctl restart "${SERVICE_NAME}.service"
    systemctl start "${SERVICE_NAME}-health.timer"
    sleep 2
    systemctl --no-pager --full status "${SERVICE_NAME}.service" || true
  else
    warn "Service is installed and enabled for boot, but it is not running now."
    warn "Start later with: systemctl start ${SERVICE_NAME}.service && systemctl start ${SERVICE_NAME}-health.timer"
  fi

  log "Done."
  log "Logs: journalctl -u ${SERVICE_NAME}.service -f"
  log "Restart: systemctl restart ${SERVICE_NAME}.service"
  log "Config: ${APP_DIR}/.env"
}

main() {
  require_root
  require_linux
  install_base_packages
  install_node
  sync_repo
  create_service_user
  install_app
  write_env_file
  write_systemd_units
  start_or_finish
}

main "$@"
