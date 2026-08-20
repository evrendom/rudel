# Rudel CLI design playground

This is a browser cockpit around the real Rudel CLI. The terminal is a real PTY served by
ttyd, so Clack prompts, ANSI color, keyboard navigation, terminal widths, retries, and
progress rendering behave exactly as they do in a user's terminal.

## Start it

Install ttyd once:

```sh
brew install ttyd
```

Then, from the repository root:

```sh
bun run playground:cli
```

The browser opens at `http://127.0.0.1:7680`. ttyd uses a random Basic-auth password on
every launch; the username and password are printed in the starting terminal and can also
be copied from the cockpit rail.

To run one scenario in an existing terminal without the browser:

```sh
bun run playground:cli:scenario whoami-signed-in
bun run playground:cli:scenario picker-real
bun run playground:cli:scenario picker-uploaded-mixed
```

The runner accepts exactly one registered scenario name. It never forwards extra arguments.

## Modes

- `local-real` is the default design surface. It reads real Claude/Codex session files and
  mirrors only cached user and organization display fields from `~/.rudel/credentials.json`.
  The real token is never serialized, logged, or sent. If no cached credentials exist, real
  session discovery still works and the terminal clearly reports that fixture display identity
  is being used.
- `fixture` generates isolated Claude/Codex transcripts for empty, failure, retry, progress,
  login, hook, and 200-project states.
- `Source` runs `apps/cli/src/bin/cli.ts` for the fast edit/restart loop.
- `Packed` builds and runs `apps/cli/dist/cli.js` with Node for release parity.

The 60×20, 80×24, 100×30, and Full controls resize the ttyd iframe, which propagates the
real terminal resize to Clack.

## Safety properties

- The control server, ttyd, and API stub bind only to `127.0.0.1`.
- ttyd starts with `--credential`, `--check-origin`, `--writable`, and `--url-arg`.
- Control mutations require the per-launch secret and the exact control-page Origin.
- The CLI child receives a minimal environment with `RUDEL_API_BASE` and stored
  `apiBaseUrl` pinned to the loopback stub; PostHog is disabled and its credentials are not
  inherited.
- Local-real session directories stay read-only. Claude settings and Codex config are
  redirected to `.context/design-playground/fake-agent-home/`.
- Stub logs contain only method, path, selected behavior, status, and byte count. They never
  contain authorization headers or request bodies.
- Generated runtime state lives under `.context/design-playground/`, which is gitignored.

Run the focused verification suite with:

```sh
bun test scripts/design-playground
./node_modules/.bin/tsc --project scripts/design-playground/tsconfig.json
```
