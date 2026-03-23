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
      "cwd": "$PROJECT_DIR"
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
      "cwd": "$PROJECT_DIR"
    }
  }
}
EOF
    echo -e "  ${YELLOW}Created $MCP_JSON (project scope fallback)${RESET}"
  else
    # Remove existing entry first to avoid duplicates
    claude mcp remove "$MCP_NAME" --scope user 2>/dev/null || true

    # Add at user scope with absolute path so it works from any directory
    claude mcp add \
      --transport stdio \
      --scope user \
      "$MCP_NAME" \
      -- npx tsx "$PROJECT_DIR/mcp/index.ts"

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
