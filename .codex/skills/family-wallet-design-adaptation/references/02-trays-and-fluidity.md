# Trays And Fluidity

The article treats trays and motion as architecture, not ornament.

## Dynamic tray system

- Use trays for transient actions that do not need to permanently occupy the app.
- Use trays for confirmations and warnings when contextual continuity matters.
- Allow trays to lead into fuller flows when the task expands.
- Give every tray a clear title and a dismiss or back affordance.
- Keep each tray focused on one primary action or one piece of content.
- Vary tray heights through a sequence so progression is unmistakable.

## Fluidity

- Preserve orientation as the interface changes.
- Avoid static transitions when motion can clarify what changed.
- Let screens, controls, and text feel connected.
- Make the app feel like one evolving space, not disconnected screens.

## Continuity rules

- Preserve persistent elements across states instead of replacing them with duplicates.
- Use directional motion when navigation direction matters.
- Let labels, buttons, cards, and surfaces evolve instead of abruptly swapping.
- Avoid redundant animations that duplicate a component already on screen.

## Anti-patterns

- teleporting between unrelated states
- fading out whole sentences when only one word changed
- replacing persistent cards instead of moving them
- adding motion that does not explain anything

## Adaptation guidance

- Do not force the `wrapped-family` route into a tray system if the route is clearly full-screen.
- Do use the tray logic when introducing contextual panels, compact overlays, step cards, or nested states inside the route.
- If the route changes sections, show how one state becomes the next.
- Shared elements should travel when they logically persist.
