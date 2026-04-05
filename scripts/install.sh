#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLAUDE_DIR="$HOME/.claude"
MCP_NAME="fino"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
DIM='\033[2m'
RESET='\033[0m'

usage() {
  echo "Usage: $(basename "$0") [--uninstall] [--project-only]"
  echo ""
  echo "  (default)        Install skills + MCP server at user scope"
  echo "  --project-only   Install MCP at project scope only (old behavior)"
  echo "  --uninstall      Remove skills and MCP server"
  exit 0
}

# Parse flags
MODE="user"
for arg in "$@"; do
  case "$arg" in
    --uninstall)   MODE="uninstall" ;;
    --project-only) MODE="project" ;;
    --help|-h)     usage ;;
    *) echo -e "${RED}Unknown flag: $arg${RESET}"; usage ;;
  esac
done

# Check for claude CLI
has_claude() {
  command -v claude &>/dev/null
}

# --- Uninstall ---
if [ "$MODE" = "uninstall" ]; then
  echo -e "${YELLOW}Uninstalling Fino...${RESET}"

  # Remove skills
  for skill_dir in "$PROJECT_DIR/.claude/skills"/*/; do
    skill_name=$(basename "$skill_dir")
    target="$CLAUDE_DIR/skills/$skill_name"
    if [ -L "$target" ]; then
      rm "$target"
      echo -e "  ${DIM}Removed skill /$skill_name${RESET}"
    fi
  done

  # Remove MCP from user scope
  if has_claude; then
    claude mcp remove "$MCP_NAME" --scope user 2>/dev/null && \
      echo -e "  ${DIM}Removed MCP server (user scope)${RESET}" || true
    claude mcp remove "$MCP_NAME" --scope project 2>/dev/null && \
      echo -e "  ${DIM}Removed MCP server (project scope)${RESET}" || true
  fi

  echo -e "\n${GREEN}Uninstalled. Restart Claude Code to apply.${RESET}"
  exit 0
fi

# --- Install ---
echo -e "${GREEN}Installing Fino for Claude...${RESET}"
echo -e "${DIM}Project: $PROJECT_DIR${RESET}"
echo ""

# Check .env exists
if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo -e "${YELLOW}Warning: .env file not found at $PROJECT_DIR/.env${RESET}"
  echo -e "${DIM}Copy .env.example to .env and add your Plaid credentials before using Fino.${RESET}"
  echo -e "${DIM}  cp .env.example .env${RESET}"
  echo ""
fi

# --- Skills ---
echo "Installing skills..."
mkdir -p "$CLAUDE_DIR/skills"

for skill_dir in "$PROJECT_DIR/.claude/skills"/*/; do
  skill_name=$(basename "$skill_dir")
  target="$CLAUDE_DIR/skills/$skill_name"
  if [ -L "$target" ] || [ -d "$target" ]; then
    rm -rf "$target"
  fi
  ln -s "$skill_dir" "$target"
  echo -e "  ${GREEN}/$skill_name${RESET}"
done
echo ""

# --- MCP Server ---
if [ "$MODE" = "project" ]; then
  # Project-scoped install (old behavior, writes .mcp.json)
  echo "Installing MCP server (project scope)..."
  MCP_JSON="$PROJECT_DIR/.mcp.json"
  cat > "$MCP_JSON" <<EOF
{
  "mcpServers": {
    "$MCP_NAME": {
      "command": "npx",
      "args": ["tsx", "mcp/index.ts"],
      "cwd": "$PROJECT_DIR",
      "env": {
        "DOTENV_CONFIG_PATH": "$PROJECT_DIR/.env"
      }
    }
  }
}
EOF
  echo -e "  ${GREEN}Created $MCP_JSON${RESET}"
else
  # User-scoped install (available everywhere)
  echo "Installing MCP server (user scope)..."
  if ! has_claude; then
    echo -e "${RED}Error: 'claude' CLI not found in PATH.${RESET}"
    echo "Install Claude Code first: https://docs.anthropic.com/en/docs/claude-code"
    echo ""
    echo "Falling back to project-scope install..."
    MCP_JSON="$PROJECT_DIR/.mcp.json"
    cat > "$MCP_JSON" <<EOF
{
  "mcpServers": {
    "$MCP_NAME": {
      "command": "npx",
      "args": ["tsx", "mcp/index.ts"],
      "cwd": "$PROJECT_DIR",
      "env": {
        "DOTENV_CONFIG_PATH": "$PROJECT_DIR/.env"
      }
    }
  }
}
EOF
    echo -e "  ${YELLOW}Created $MCP_JSON (project scope fallback)${RESET}"
  else
    # Remove existing entry first to avoid duplicates
    claude mcp remove "$MCP_NAME" --scope user 2>/dev/null || true

    # Read env vars from .env and pass them directly to the MCP config.
    # MCP clients spawn child processes that may not inherit the shell env
    # or be able to read .env files, so we inject the vars explicitly.
    ENV_FLAGS=""
    if [ -f "$PROJECT_DIR/.env" ]; then
      while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ -z "$key" || "$key" == \#* ]] && continue
        # Strip surrounding quotes from value
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        ENV_FLAGS="$ENV_FLAGS -e $key=$value"
      done < "$PROJECT_DIR/.env"
    fi

    # Always include DOTENV_CONFIG_PATH as a fallback
    ENV_FLAGS="$ENV_FLAGS -e DOTENV_CONFIG_PATH=$PROJECT_DIR/.env"

    eval claude mcp add "\"$MCP_NAME\"" \
      --transport stdio \
      --scope user \
      $ENV_FLAGS \
      -- npx tsx "\"$PROJECT_DIR/mcp/index.ts\""

    echo -e "  ${GREEN}Installed '$MCP_NAME' MCP server at user scope${RESET}"
    echo -e "  ${DIM}Available in all projects and conversations${RESET}"
  fi
fi

echo ""
echo -e "${GREEN}Done.${RESET} Restart Claude Code to pick up the changes."
echo ""
echo "Available slash commands:"
echo "  /snapshot        - Quick financial health check"
echo "  /monthly-report  - Detailed month-end report"
echo "  /spending-audit  - Find recurring charges and waste"
echo "  /find-charges    - Search for specific merchants"
echo "  /cash-flow       - Income vs expense trends"
echo "  /sync            - Force sync bank data"
