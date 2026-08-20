# rudel

CLI for uploading Claude Code / Codex session transcripts to [Rudel](https://app.rudel.ai) for analytics.

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

# 2. Choose the repositories Rudel should keep in sync
rudel upload

# That's it! Your Claude Code / Codex sessions will now be uploaded automatically.
```

## Commands

### `rudel login`

Authenticate with Rudel. Opens your browser to [app.rudel.ai](https://app.rudel.ai) where you sign in, then the CLI receives a token automatically.

Flags:

| Flag | Description |
|---|---|
| `--api-base <url>` | API server to authenticate against. Defaults to `RUDEL_API_BASE`, else `https://app.rudel.ai`. Must be `https://`, or `http://` on a loopback host. |
| `--allow-insecure-api-base` | Permit plaintext `http://` on a non-loopback host, for **both** the API base and the browser verification URL it returns. Your access token and ingest API key are then sent unencrypted, so only use this on a trusted network. Also settable as `RUDEL_ALLOW_INSECURE_API_BASE=1`. |
| `--no-browser` | Print the verification URL instead of opening a browser. |

The API base must not carry a query string or fragment — `https://host?tenant=acme` is rejected, because the CLI appends paths such as `/api/auth/device/code` to it.

Self-hosting over plain HTTP therefore needs `--allow-insecure-api-base` on every `rudel login`. The server also logs a warning at startup when its own verification origin is plaintext. Serving your deployment over HTTPS is strongly preferred; plaintext exposes the login token, the ingest API key, and every uploaded transcript to anyone on the network path.

### `rudel enable`

Enables automatic upload for the current repository. `rudel upload` is the recommended way to review and toggle all discovered repositories together.

### `rudel disable`

Turns automatic upload off and removes the Claude Code / Codex hooks.

### `rudel upload [session]`

Keep repositories in sync with Rudel. Run without arguments to see canonical repositories, their new/uploaded counts, and their current automatic-upload state. Checked repositories stay on automatic upload and have their new sessions uploaded immediately; unchecked repositories are disabled. Pass a session ID or file path for an explicit one-session upload.

```bash
# Review and toggle repositories, then upload their new sessions
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

Upload endpoints must use HTTPS, except that loopback HTTP endpoints such as
`http://localhost:4010/rpc` are allowed for local development. Plaintext HTTP
to any other host is refused unless the upload-specific
`--allow-insecure-endpoint` flag is passed or
`RUDEL_ALLOW_INSECURE_ENDPOINT=1` is set. This opt-in is intentionally separate
from `--allow-insecure-api-base`: it permits the ingest API key and full
transcript to cross the network unencrypted and should only be used on a
trusted network. Non-HTTP URLs, malformed URLs, and URLs with embedded
credentials are always refused.

Automatic Claude Code and Codex uploads use the environment form because hooks
run unattended. If `RUDEL_API_BASE` names an unsafe destination, the hook
refuses the upload, reports the reason in stderr and
`~/.rudel/logs/hook-upload.log`, and adds the session to the failed-upload queue
for `rudel upload --retry`; it does not fall back to the saved API base.

When run without arguments, `rudel upload` scans local Claude Code and Codex sessions and groups worktrees under their high-level repository. Each row shows `new`, `uploaded`, and automatic-upload state. Existing automatic-upload choices are pre-selected. Use arrow keys to navigate, space to toggle, and enter to save the repository choices and upload new sessions. The global agent hooks only dispatch events; a repository allowlist decides whether each event may upload.

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

## Known-secret Redaction

Before upload, the CLI redacts known secret patterns in both the main transcript and every sub-agent transcript. The Rudel API reapplies the same deterministic filter before storage and reports counts by pattern; matched values are removed in full and never included in the summary. Uploads are stopped if known-pattern redaction exceeds 20% of the transcript or the bounded filter cannot establish a stable result.

This substantially reduces exposure, but it does not catch `DB_PASSWORD=hunter2`, bare custom tokens without a distinguishing prefix, secrets split across lines, base64-encoded or paraphrased secrets, credentials in screenshots, or double-escaped JSON embedded inside another JSON string. Seven of the 18 selected rules also require a restricted trailing delimiter, so ordinary punctuation immediately after a secret can prevent a match. Keep secrets out of coding-agent sessions whenever possible.

## Links

- **Web App**: [app.rudel.ai](https://app.rudel.ai)
- **Issues**: [GitHub Issues](https://github.com/evrendom/rudel/issues)
