# Organize

Use this when the user wants to clean up, componentize, or organize their UI
code.

## Activation

Activate when the user asks to:

- clean up, organize, or refactor code structure
- extract or componentize a page or section
- reduce duplication in UI code

Do not activate when:

- the user wants a new design or layout
- the request is about visual changes, not code structure
- the user wants to clean up Tailwind classes, which is a
  `design-guidelines/general` concern

## User-Facing Progress Updates

Keep the user informed so longer runs do not look stuck.

- One-line status update before each major phase.
- Concrete and lightweight: what you are doing now, not verbose logs.

## Rules

- Break designs into small, focused components instead of rendering everything
  in a single large component.
- Never bake margins into components. Apply margins at the call site instead.
  Every component must accept a `class` attribute and merge it with the classes
  on the component's top-level element.
- Use `clsx` or a similar helper to merge classes together in client-side
  components.
- Always extract form controls into reusable components organized by HTML
  element: one `Input` component for all `<input>` types, one `Select` for
  `<select>`, one `Textarea` for `<textarea>`.
- When two or more elements share the same structure and styling but differ
  only in props like labels, placeholders, or types, extract them into a single
  reusable component parameterized by those differences.
- After extracting components, scan them for duplicated patterns and extract
  shared elements into reusable components.
- Always use existing project components when they are available. Reuse or
  extend them instead of creating new ones.
- Use `npx @tailwindcss/cli canonicalize` to clean up Tailwind class lists.

Single class string:

```sh
npx @tailwindcss/cli canonicalize "mt-2 mr-2 mb-2 ml-2"
```

Multiple class strings:

```sh
npx @tailwindcss/cli canonicalize "py-3 p-1 px-3" "mt-2 mr-2 mb-2 ml-2"
```

Pipe class strings via stdin:

```sh
echo "py-3 p-1 px-3\nmt-2 mr-2 mb-2 ml-2" | npx @tailwindcss/cli canonicalize
```

Structured output:

```sh
npx @tailwindcss/cli canonicalize --format json "py-3 p-1 px-3"
```

Stream mode:

```sh
npx @tailwindcss/cli canonicalize --stream
```
