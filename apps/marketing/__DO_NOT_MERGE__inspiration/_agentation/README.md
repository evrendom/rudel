# Agentation overlay — DELETE BEFORE MERGE

This standalone, local-only bundle mounts Agentation over every inspiration
page without modifying the captured website's React tree.

Rebuild after changing `overlay.tsx`:

```sh
bun apps/marketing/__DO_NOT_MERGE__inspiration/_agentation/build.mjs
```

Use the bottom-right toolbar to activate inspection, point at an element, add a
note, and copy the structured output into the coding-agent conversation.
Annotations are also mirrored into this folder as one JSONL file per
inspiration site so the local agent can inspect them directly.
