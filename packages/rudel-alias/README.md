# rudel

Compatibility alias for [`@opalinehq/cli`](https://www.npmjs.com/package/@opalinehq/cli).

Existing `rudel` commands, hooks, cron jobs, arguments, standard input/output,
and exit codes continue through the Opaline CLI. The alias prints
`rudel is now opaline` once to stderr per invocation, then delegates to the
canonical CLI without changing stdout. New installations should use:

```bash
npm install --global @opalinehq/cli
```
