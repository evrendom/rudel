# Session request-level transcript archive

Status: archived on 2026-08-18. The shipped session detail pane always uses
the normal, headerless request presentation. The former Normal/Request toggle
was removed, and `?level=request` is no longer a production rendering input.

The request-level design remains available for visual reference in the dev
trace fixture:

`/dev/trace-tree-fixture?mode=continuous&transcript=virtual&display=request&constellation=v2`

Its renderer and grouping model remain in the conversation trace and session
transcript section modules. This fixture is an archive surface only; it is not
a supported session-detail mode.
