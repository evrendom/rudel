# UI Picker

Use this when the user wants to see and pick between multiple UI
implementations while previewing them in the browser.

## Activation

Activate when the user asks to:

- see multiple designs/options/variants/alternatives
- compare different UI approaches for a component, section, or page
- choose what looks best between a few implementations
- get UI suggestions/recommendations, for example: "any suggestions?"

Do not activate when:

- the user asked for one definitive implementation only
- the request is not about UI variation, for example purely logic or data work
- "any suggestions?" or similar is asked in a non-UI context

## Required Companion Modules

Before generating variants, always load and apply `design-guidelines.md`.

## User-Facing Progress Updates

While running this skill, keep the user informed so longer runs do not look
stuck.

- Send a short one-line status update before each major phase.
- Keep updates concrete and lightweight: what you are doing now, not verbose
  logs.
- On larger codebases, post another brief update every few tool calls or when a
  step is taking longer than expected.
- If blocked, say what is blocking you and what you will try next.

Suggested phase updates:

- Cleaning prior picker scaffolding from earlier rounds.
- Scanning current UI and identifying decision points.
- Implementing variant options in existing files.
- Injecting/verifying the picker toolbar.
- Preparing selection question(s).
- Finalizing selected variant with partial or full cleanup.
- Running validation checks.

## Workflow

1. If this skill has already been used in the same conversation/project, run an
   iteration reset pass first:
   - Use the currently selected/visible UI as the baseline.
   - Remove lingering artifacts from earlier rounds: old unselected branches,
     stale `hidden` attributes, and picker wrappers/attributes that are no
     longer needed.
   - Keep one toolbar script tag if the user is still comparing options; remove
     duplicates only.
   - Ensure each area is back to one clean implementation before generating new
     options.
2. Define decision points before coding:
   - Give each decision a human-readable label, for example `Hero style` or
     `Pricing layout`.
   - Decide how many options to generate. Default: 3-4 new options unless the
     user asked for a specific count.
   - When iterating on an existing design, include the current implementation as
     option 1 and suffix its label with `(current)`, then add at least 3 new
     options on top of it.
   - For entirely new sections with no prior implementation, do not force a
     `(current)` option.
3. Plan each option before coding.

   New designs with no existing aesthetic should define:
   - Layout
   - Typography
   - Color
   - Spacing
   - Surfaces
   - Shape
   - Personality

   Adding to an existing design should match the existing aesthetic and vary
   layout, content structure, and component choices rather than the style.

4. Implement variants directly in existing source files.
   - Never create standalone preview files.
   - Share business logic and data flow; vary presentation only.
5. Annotate each decision with UI picker attributes:
   - Parent wrapper: `data-uidotsh-pick="Human readable label"`
   - Option nodes: `data-uidotsh-option="Human readable option"`
   - For existing-design variation requests, the first option must be the
     current implementation and include `(current)` in its option label.
   - Exactly one option visible; all others use `hidden`.
   - Apply the Tailwind CSS `contents` class to wrapper and option nodes so
     wrappers do not affect layout.
6. After all variants are implemented, inject the toolbar script once in a
   shared app layout/root shell.
   - Prefer framework-native script APIs when available.
   - For Next.js, use `next/script`.
   - If there is no framework script primitive, inject a single script tag right
     before `</body>`:

   ```html
   <script src="https://ui.sh/ui-picker.js"></script>
   ```

7. Let the user preview variants in-browser with the picker toolbar.
8. If the toolbar cannot load, skip preview and ask for selection in chat using
   labels and descriptions.
9. Ask for selection in the agent:
   - Use explicit option labels matching the UI picker labels.
   - Keep custom input enabled.
   - For multiple decision points, ask one clear question per decision.
10. Finalize after selection:
    - Keep only selected variants.
    - Remove unselected variants and any now-unneeded picker wrapper
      attributes.
    - Remove lingering `hidden` attributes and empty wrappers created only for
      picker scaffolding.
    - Remove temporary comments/suppressions used only for variant scaffolding.
    - Remove the picker script only when the user is done comparing or asks for
      final cleanup.
11. Validate final output:
    - Check desktop and mobile layouts.
    - Ensure no broken semantics or duplicate `id` attributes remain.
    - Run relevant lint/typecheck/tests when available.

## Markup Patterns

### HTML

```html
<div data-uidotsh-pick="Hero style" class="contents">
  <div data-uidotsh-option="Minimal" class="contents">...</div>
  <div data-uidotsh-option="Bold" class="contents" hidden>...</div>
  <div data-uidotsh-option="Editorial" class="contents" hidden>...</div>
</div>
```

### React/TSX

```tsx
<div data-uidotsh-pick="Hero style" className="contents">
  <div data-uidotsh-option="Minimal" className="contents">
    ...
  </div>
  <div data-uidotsh-option="Bold" className="contents" hidden>
    ...
  </div>
</div>
```

## Non-Negotiable Rules

- Do all variant work in existing source files.
- Provide concise user-facing progress updates across major phases.
- Use `data-uidotsh-pick` and `data-uidotsh-option` markers for every
  decision.
- Use the Tailwind CSS `contents` class on wrapper and option nodes.
- For existing-design variation requests, option 1 must be the current
  implementation and include `(current)` in its label.
- Unless the user specifies otherwise, generate 3-4 new options per decision.
- Exactly one option starts visible; all others start `hidden`.
- Before starting a new suggestion/options round, clean previous unselected
  picker artifacts so nothing old lingers.
- Ask for final selection in the agent, then remove all unpicked variants.
- Inject the picker script only after variants are in place.
- During cleanup, remove script tags/usages before deleting related imports so
  stepwise saves never leave unresolved references.
- Remove the picker script only when the user is done comparing or explicitly
  asks for final cleanup.
