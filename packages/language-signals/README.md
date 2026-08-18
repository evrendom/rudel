# `@rudel/language-signals`

This package exists to provide deterministic tone signals over a user's own
transcripts. Identity slurs are permanently excluded, and matching uses literal
surface forms only—no stemming, fuzzy matching, or leetspeak.

The package owns the shared negative, swear, apology, and
positive-reinforcement rules, UTF-16 match offsets, and display-boundary
splitting used to keep code and XML out of prose scans. A contiguous run of two
or more question marks is one negative match; a single question mark is neutral.
