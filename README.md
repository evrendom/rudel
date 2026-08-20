# Rudel

**Try the hosted version for free at [rudel.ai](https://rudel.ai)**

Analytics for Claude Code and Codex. Rudel gives you a dashboard with insights on your coding sessions — token usage, session duration, activity patterns, model usage, and more.

## Prerequisites

- [Bun](https://bun.sh) runtime installed

## Getting Started

1. Create an account at [app.rudel.ai](https://app.rudel.ai)
2. Install the CLI and connect it to your account:

```bash
npm install -g rudel

rudel login     # authenticate via your browser
rudel upload    # choose repositories to keep automatically in sync
```

3. Invite teammates (optional): go to **Settings → Organization** in the dashboard, enter their email, and share the generated invite link with them.

That's it. Your Claude Code / Codex sessions will now be uploaded automatically.

`rudel upload` groups local worktrees into canonical repositories, shows which sessions already exist in Rudel, and lets you toggle automatic upload per repository. Enabling a repository also uploads its new historical sessions, so there is no separate batch-only setup choice.

See the [CLI documentation](apps/cli/README.md) for all available commands.

## How It Works

1. You install the CLI and run `rudel upload`
2. You select the repositories that should stay in sync
3. Rudel registers Claude Code / Codex hooks that run when a session ends and ignores hook events from repositories you left off
4. The hook redacts known secret patterns and uploads the session transcript to Rudel
5. Transcripts are stored in ClickHouse and processed into analytics

## What Data Is Collected

Each uploaded session includes:

- Session ID & timestamps (start, last interaction)
- User ID & organization ID
- Project path & package name
- Git context (repository, branch, SHA, remote)
- Session transcript (full prompt & response content)
- Sub-agent usage

## Security & Privacy Disclaimer

Rudel is designed to ingest full coding-agent session data for analytics. That means uploaded transcripts and related metadata may contain sensitive material, including source code, prompts, tool output, file contents, command output, URLs, and secrets that appeared during a session.

The current CLI redacts known secret patterns from the main transcript and sub-agent transcripts before upload, and the API reapplies the same deterministic filter before storage. Matched values are removed in full; uploads are stopped if known-pattern redaction exceeds 20% of the transcript or the bounded filter cannot establish a stable result. This reduces exposure but does not catch `DB_PASSWORD=hunter2`, bare custom tokens without a distinguishing prefix, secrets split across lines, base64-encoded or paraphrased secrets, credentials in screenshots, or double-escaped JSON embedded inside another JSON string. Seven of the 18 selected rules also require a restricted trailing delimiter, so ordinary punctuation immediately after a secret can prevent a match. Do not treat the filter as a substitute for keeping secrets out of coding-agent sessions.

Only enable Rudel on projects and environments where you are comfortable uploading that data. Review the [Rudel Privacy Policy](https://rudel.ai/privacy) before enabling uploads for yourself or your team.

We also use limited product analytics on the hosted service to understand whether core workflows work, diagnose failures, and improve the product. This is explicit event tracking for account and authentication flows, CLI login and enable flows, session upload outcomes, dashboard views and interactions, organization management actions, and a small set of utility interactions such as theme toggle or sidebar collapse.

This product analytics layer is intentionally limited. It does not enable blanket click autocapture, session replay, or surveys by default. It is designed to capture product events and operational context like page name, action name, date range, normalized error codes, and organization or user identifiers where needed. It should not include raw transcript content, source code, prompts, tool output, command output, or file contents from your sessions. By using the hosted app, you agree to this limited analytics processing as part of the service.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, development commands, and PR guidelines.

For self-hosting your own instance, see [docs/self-hosting.md](docs/self-hosting.md).

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md). Do not open public issues for security concerns.

## License

[MIT](LICENSE)
