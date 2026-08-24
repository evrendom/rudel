# `@opalinehq/cli`

The canonical Opaline CLI package for Claude Code and OpenAI Codex session
analytics.

```bash
npm install --global @opalinehq/cli
opaline login
opaline enable
opaline doctor
```

The CLI keeps using the existing `~/.rudel` state directory so upgrades do not
require another login. Its production API remains `https://app.rudel.ai`.

For commands, configuration, troubleshooting, and the full security/data
handling disclosure, see the
[repository README](https://github.com/opalinehq/cli#readme).

Important: session transcripts are uploaded. Known-pattern secret filtering is
best-effort and cannot guarantee that every sensitive value is removed.
