# rudel

CLI for uploading [Claude Code](https://docs.anthropic.com/en/docs/claude-code) session transcripts to [Rudel](https://app.rudel.ai) for analytics.

## Prerequisites

- [Bun](https://bun.sh) runtime installed

## Installation

```bash
npm install -g rudel
```

## Quick Start

```bash
# 1. Log in via your browser
rudel login

# 2. Enable automatic session uploads
rudel enable

# That's it! Your Claude Code sessions will now be uploaded automatically.
```

## Commands

### `rudel login`

Authenticate with Rudel. Opens your browser to [app.rudel.ai](https://app.rudel.ai) where you sign in, then the CLI receives a token automatically.

### `rudel enable`

Registers a [Claude Code hook](https://docs.anthropic.com/en/docs/claude-code/hooks) that automatically uploads your session transcript when a Claude Code session ends. This is the recommended way to use Rudel -- set it and forget it.

### `rudel disable`

Removes the auto-upload hook.

### `rudel upload [session]`

Upload session transcripts. Run without arguments to interactively select projects for batch upload, or pass a session ID / file path to upload a single session.

```bash
# Interactive project picker (batch upload)
rudel upload

# Upload by session ID
rudel upload abc123

# Upload a specific file
rudel upload ./path/to/session.jsonl

# Preview without uploading
rudel upload --dry-run

# Auto-classify sessions
rudel upload --classify
```

When run without arguments, `rudel upload` scans `~/.claude/projects/` for all projects with session transcripts and presents an interactive picker. The current project (matched from your working directory) and its subfolders are pre-selected. Use arrow keys to navigate, space to toggle, and enter to confirm.

### `rudel whoami`

Show the currently authenticated user.

### `rudel logout`

Clear stored credentials.

## What Data Is Collected

Each uploaded session includes:

- Session ID & timestamps (start, last interaction)
- User ID & organization ID
- Project path & package name
- Git context (repository, branch, SHA, remote)
- Session transcript (full prompt & response content)
- Sub-agent usage

## Links

- **Web App**: [app.rudel.ai](https://app.rudel.ai)
- **Issues**: [GitHub Issues](https://github.com/obsessiondb/rudel/issues)
