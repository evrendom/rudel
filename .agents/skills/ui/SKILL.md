---
name: ui
description: "Explore, build, and refine UI."
---

# UI

This skill helps you build user interfaces with Tailwind CSS, from full
landing pages to individual components, either from scratch or by refining
existing designs.

## When Invoked Without A Prompt

If the user runs `/ui` with no additional input, introduce the skill by
explaining the kinds of things it is good for. Do not present a menu or ask
what they want to do. Help them understand what is possible so they can come
back with a specific request.

Good for:

- Building new UI: landing pages, dashboards, marketing sections, app
  interfaces, individual components
- Exploring design directions: generating multiple variations to compare and
  choose from
- Refining existing work: improving layouts, cleaning up Tailwind markup,
  adding responsive behavior, implementing dark mode
- Organizing code: extracting components, reducing duplication, and cleaning up
  code structure

Mention a few example prompts they might try:

- "Show me a few different directions for this hero section"
- "Add a grid/list view toggle to this dashboard"
- "Give me some ideas for making this feature section more visually
  interesting"
- "Build a pricing page with three tiers"
- "Add dark mode support to this page"
- "Clean up the Tailwind classes in this component"
- "Componentize this page"

Keep it conversational and brief.

## When Invoked With A Prompt

Route the request by loading the appropriate supporting files before doing any
implementation work.

### Supporting Files

Based on the user's prompt, load any of these files that feel relevant:

- `design-guidelines.md`: index of design and coding rules with a directory of
  specific guideline files for components, typography, Tailwind authoring, and
  more. Load this for any UI work, then load the specific guideline files it
  points to.
- `ui-picker.md`: workflow for generating multiple design variations the user
  can compare and choose from. Default to using this for open-ended or
  exploratory requests.
- `finalize.md`: workflow for cleaning up, componentizing, and organizing UI
  code. Only activate when the user explicitly asks to organize, componentize,
  or extract components.

### Routing Examples

| Prompt | Files to load |
| --- | --- |
| "Build a landing page for a SaaS product" | `design-guidelines.md`, plus relevant deeper guideline pages such as `general`, `landing-pages`, `headers`, `heading-groups`, `buttons`, `feature-lists`, `pricing-cards`, `testimonials`, `footers`, `typography` |
| "Show me 3 different hero layouts" | `design-guidelines.md`, plus relevant deeper guideline pages such as `general`, `heading-groups`, `buttons`, `images`, `section-layout`, `typography`, and `ui-picker.md` |
| "Add dark mode to this page" | `design-guidelines.md`, plus relevant deeper guideline pages such as `general`, `colors`, `dark-mode` |
| "Clean up the Tailwind in this file" | `design-guidelines.md`, plus relevant deeper guideline pages such as `general` |
| "Componentize this page" | `finalize.md`, `design-guidelines.md`, plus relevant deeper guideline pages such as `general` |
| "Build a dashboard with a sidebar" | `design-guidelines.md`, plus relevant deeper guideline pages such as `general`, `dashboards`, `headers`, `surfaces`, `typography` |

## Core Behavior

- This skill only activates when explicitly invoked with `/ui`
- If `/ui` is used for something clearly unrelated to UI work, explain what the
  skill is for and ask the user to clarify
- Load supporting files before writing code; do not skip the design guidelines
- When requests are ambiguous, ask one focused clarifying question rather than
  guessing

## Notes

- The deeper guideline pages listed by `design-guidelines.md` can be loaded
  on-demand via their `uidotsh://ui/design-guidelines/...` links.
