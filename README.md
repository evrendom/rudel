# Rudel

**Try the hosted version for free at [rudel.ai](https://rudel.ai)**

Analytics for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Rudel gives you a dashboard with insights on your coding sessions — token usage, session duration, activity patterns, model usage, and more.

## Prerequisites

- [Bun](https://bun.sh) runtime installed

## Getting Started

1. Create an account at [app.rudel.ai](https://app.rudel.ai)
2. Install the CLI and connect it to your account:

```bash
npm install -g rudel

rudel login     # authenticate via your browser
rudel enable    # auto-upload sessions when Claude Code exits
```

3. Invite teammates (optional): go to **Settings → Organization** in the dashboard, enter their email, and share the generated invite link with them.

That's it. Your Claude Code sessions will now be uploaded automatically.

Already have past sessions? Upload them in one go:

```bash
rudel upload    # interactive picker for batch upload
```

See the [CLI documentation](apps/cli/README.md) for all available commands.

## How It Works

1. You install the CLI and run `rudel enable`
2. This registers a [Claude Code hook](https://docs.anthropic.com/en/docs/claude-code/hooks) that runs when a session ends
3. The hook uploads the session transcript to Rudel
4. Transcripts are stored in ClickHouse and processed into analytics

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

Only enable Rudel on projects and environments where you are comfortable uploading that data. If you use the hosted service at `app.rudel.ai`, we do not have access to personal data contained in uploaded transcripts and cannot read that data. Review the [Rudel Privacy Policy](https://rudel.ai/privacy-policy) before enabling uploads for yourself or your team.

We also use limited product analytics on the hosted app to understand whether core workflows work, diagnose failures, and improve the product. Today this is explicit event tracking around signup, dashboard usage, insight clicks, lifecycle CLI activity, and upload outcomes; it does not enable blanket click autocapture or session replay by default. By using the hosted app, you agree to this limited analytics processing as part of the service. The implementation landed incrementally in [#160](https://github.com/obsessiondb/rudel/pull/160), [#161](https://github.com/obsessiondb/rudel/pull/161), [#162](https://github.com/obsessiondb/rudel/pull/162), [#163](https://github.com/obsessiondb/rudel/pull/163), and [#167](https://github.com/obsessiondb/rudel/pull/167).

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, development commands, and PR guidelines.

For self-hosting your own instance, see [docs/self-hosting.md](docs/self-hosting.md).

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md). Do not open public issues for security concerns.

## License

[MIT](LICENSE)
