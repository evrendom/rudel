# Wrapped Storyboard

## Goal

Turn the current v1-safe metrics into a story that feels personal, screenshotable, and socially legible.

The target is not "show every stat." The target is:

- identity first
- one idea per card
- numbers that are easy to compare with friends
- at least one flex card
- at least one slightly embarrassing or self-aware card
- a final frame that works as a standalone share image

## Available Inputs

These are the metrics we can use with high confidence today:

- days since first session
- total sessions
- active days
- favorite model
- total tokens
- estimated spend
- longest session
- Claude vs Codex split

## Safe Derived Metrics

These can be derived from the available inputs without adding new data dependencies:

- sessions per active day
- tokens per session
- dominant source share
- source archetype label from Claude vs Codex split

## Viral Design Rules

- Each card should land in under one second.
- Each card should have one headline and one supporting line at most.
- The headline should be screenshot-safe without needing the previous card for context.
- Avoid dashboards. Every card should feel like a reveal, not a report.
- Keep one card for personal identity, one for work ethic, one for allegiance, one for confession, and one for flex.
- The share card should repeat the strongest identity label, not the raw metric list.

## Story Arc

### 1. Cover

Emotional job:
Introduce the person as the hero, not the product.

Uses:
- portrait

Headline direction:
- `Your Claude Code / Codex Wrapped`

Supporting copy:
- `A look at how you actually worked.`

Why it matters:
This is the "this is about me" frame. It should feel clean enough that people keep going.

### 2. Origin Myth

Emotional job:
Create instant nostalgia and a sense of history.

Uses:
- days since first session

Headline direction:
- `It started {days} days ago.`

Supporting copy:
- `That was the first recorded session in this workspace.`

Why it matters:
Spotify Wrapped works because it makes your history feel meaningful. This is the equivalent of "when your year began."

### 3. Work Rate

Emotional job:
Turn usage into identity through discipline and repetition.

Uses:
- total sessions
- active days
- sessions per active day

Headline direction:
- `{total_sessions} sessions across {active_days} active days.`

Supporting copy:
- `That's {sessions_per_active_day} sessions every day you showed up.`

Why it matters:
This is the first clean flex card. It tells people whether they were casual or truly deep in it.

### 4. Model Type

Emotional job:
Give the user a recognizable preference they can instantly identify with.

Uses:
- favorite model

Headline direction:
- `You had a type.`

Supporting copy:
- `{favorite_model} was your go-to model.`

Why it matters:
People love identity labels. This is tribal, easy to compare, and naturally conversational.

### 5. Claude / Codex Archetype

Emotional job:
Convert the source split into a meme-able self-description.

Uses:
- Claude vs Codex split
- dominant source share
- source archetype label

Archetype labels:
- `Claude Loyalist` when Claude share is 70% or higher
- `Codex Pilot` when Codex share is 70% or higher
- `Two-Track Operator` when both are between 40% and 60%
- `Hybrid Builder` for everything else

Headline direction:
- `You're a {source_archetype}.`

Supporting copy:
- `{dominant_source_share}% of your sessions leaned {dominant_source}.`

Why it matters:
This is one of the most shareable cards because it compresses behavior into a label.

### 6. Token Flex

Emotional job:
Show the scale of usage in a dramatic way.

Uses:
- total tokens
- tokens per session

Headline direction:
- `{total_tokens} tokens.`

Supporting copy:
- `About {tokens_per_session} tokens every session.`

Why it matters:
This is the big-number card. It should feel expensive, obsessive, or impressive depending on the outcome.

### 7. Lock-In Card

Emotional job:
Add a self-aware confession card people want to repost.

Uses:
- longest session

Headline direction:
- `Your longest lock-in lasted {longest_session_min} minutes.`

Supporting copy:
- `One session got a little out of hand.`

Why it matters:
Spotify Wrapped often works because one card feels a little too honest. This is that moment.

### 8. Spend Reveal

Emotional job:
End the stat sequence with a number people instinctively compare.

Uses:
- estimated spend

Headline direction:
- `${estimated_spend_usd} in estimated spend.`

Supporting copy:
- `Calculated from the current pricing catalog.`

Why it matters:
This is part flex, part confession. The word `estimated` must always stay visible.

### 9. Share Card

Emotional job:
Collapse the story into one portable, screenshot-first frame.

Uses:
- source archetype label
- favorite model
- total sessions
- total tokens

Headline direction:
- `{source_archetype}`

Supporting copy:
- `{favorite_model} • {total_sessions} sessions • {total_tokens} tokens`

CTA direction:
- `Share on X`
- `Share on LinkedIn`
- `Follow on X for the $500 giveaway`

Why it matters:
This is the asset people actually post. It should look complete even if nobody saw the rest of the sequence.

## Cut-Down Version

If we need a shorter version for the first pass, keep these cards:

1. Cover
2. Origin Myth
3. Work Rate
4. Claude / Codex Archetype
5. Lock-In Card
6. Share Card

That preserves the emotional arc without turning the experience into a stat dump.

## Render Notes

- Keep every card vertically centered and mobile-first.
- Headlines should be readable in screenshots at story size.
- The share card should be exportable as both a static image and the final frame of the video.
- Motion should feel intentional but not slow. These cards are occasional, so they can have personality, but the pacing still needs to feel snappy.
