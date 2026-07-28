# @rudel/secret-filter

Deterministic redaction of known secret patterns in Rudel session transcripts.
The runtime package has no dependencies.

The generated rules are sourced from the high-confidence, prefixed rules in
[Gitleaks v8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1).
The exact upstream TOML checksum and selected rule IDs live in
`scripts/ruleset-config.ts`. Run `bun run update:gitleaks` from this package to
verify the pin, refresh the vendored TOML subset, and regenerate the TypeScript
module.

This filter intentionally does not use entropy or generic-token heuristics to
mutate transcripts. It favors precision over recall.

Matched values are removed in full, including matches larger than 8 KiB. Those
large matches receive an `overlong-match` diagnostic, and their complete UTF-8
size counts toward the upload's 20% redaction safety budget. Filtering is
bounded to four changing passes plus a clean confirmation; an upload is
rejected if the filter cannot establish a fixpoint without another change.
