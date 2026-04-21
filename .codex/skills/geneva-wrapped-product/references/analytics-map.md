# Analytics Map

These are the main recap-relevant data layers in Geneva.

## WrappedV1

File:
- `packages/api-routes/src/schemas/analytics.ts`

`WrappedV1` currently exposes a smaller recap payload centered on:
- first and last session dates
- days since first session
- total sessions
- active days
- favorite model
- total tokens
- estimated spend
- longest session
- source split

## Developer Analytics

File:
- `packages/api-routes/src/schemas/analytics.ts`

Developer-level schemas already include recap-valuable fields such as:
- `avg_session_duration_min`
- `success_rate`
- `success_rate_trend`
- `top_skills`
- `top_slash_commands`
- `top_subagents`
- `distinct_projects`
- `repositories_touched`
- `models_used`
- `total_commits`
- `input_tokens`
- `output_tokens`

## Session Analytics

File:
- `packages/ch-schema/src/db/schema/session-analytics.ts`

Session-derived fields include:
- `total_interactions`
- `error_count`
- `model_used`
- `has_commit`
- `session_archetype`
- `success_score`
- `used_plan_mode`
- cache token fields

## Existing Rich Mapper

File:
- `apps/web/src/features/wrapped/use-fifa-wrapped-data.ts`

The older wrapped mapper already assembles many story-ready fields, including:
- `topSkill`
- `topSlashCommand`
- `topSubagent`
- `topProjectName`
- `commitRate`
- `successRate`
- `successRateTrend`
- `dominantArchetype`
- `longestStreakDays`
- `planModeRate`
- `peakDayDate`
- `primaryErrorPattern`

Prefer reusing or extending this mapper before creating duplicate recap aggregation logic.
