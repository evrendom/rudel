-- chkit-migration-format: v1
-- generated-at: 2026-08-05T12:00:00.000Z
-- cli-version: 0.1.0-beta.16
-- definition-count: 1
-- operation-count: 3
-- risk-summary: safe=3, caution=0, danger=0

-- Additive, non-null provenance used only to select exact published rates.
-- Existing rows retain empty values and remain readable at the base rate where
-- an empty dimension is explicitly compatible.

-- operation: alter_table_add_column key=table:rudel.usage_events:column:model_provider risk=safe
ALTER TABLE rudel.usage_events
  ADD COLUMN IF NOT EXISTS `model_provider` LowCardinality(String) DEFAULT ''
  AFTER `service_tier`;

-- operation: alter_table_add_column key=table:rudel.usage_events:column:inference_speed risk=safe
ALTER TABLE rudel.usage_events
  ADD COLUMN IF NOT EXISTS `inference_speed` LowCardinality(String) DEFAULT ''
  AFTER `model_provider`;

-- operation: alter_table_add_column key=table:rudel.usage_events:column:inference_geo risk=safe
ALTER TABLE rudel.usage_events
  ADD COLUMN IF NOT EXISTS `inference_geo` LowCardinality(String) DEFAULT ''
  AFTER `inference_speed`;
