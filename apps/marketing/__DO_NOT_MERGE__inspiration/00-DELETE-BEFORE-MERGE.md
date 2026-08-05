# Delete before merge

This directory contains temporary local replicas used only for design study.

Do not commit, publish, or merge anything from this directory. Delete the entire `__DO_NOT_MERGE__inspiration` directory before merging the Opaline marketing work to `main`.

## Point at components with Agentation

Every local inspiration server injects the shared Agentation toolbar in the
bottom-right corner. Activate it, point at an element, add a focused note, and
either copy the structured markdown into the agent conversation or tell the
agent to read the site's annotations.

The overlay records selectors, element paths, classes, computed styles,
accessibility context, nearby text, geometry, and animation timestamps. Events
are mirrored to `_agentation/<site>.annotations.jsonl` for direct local access.
