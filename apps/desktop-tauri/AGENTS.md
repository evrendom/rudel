# Tauri Desktop Shell Scope

This app is the first desktop shell for Rudel.

It owns:

- Tauri bootstrap
- window config
- Tauri commands
- Tauri invoke adapter

It mounts the product UI from `packages/desktop-ui`:

```tsx
<RudelDesktopApp localEngine={tauriLocalEngine} />
```

Keep product screens, product state, and Skill Blueprint workflows in `packages/desktop-ui`.
