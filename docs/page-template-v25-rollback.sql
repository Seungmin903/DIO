-- Deployment order: release the frontend containing studyPlanner.js, dayPlanner.js and serverCatalog.js first.
-- These planner IDs render as runtime SVGs; no separate backend SVG asset is required.
-- V25 deployment preflight: this must return no rows before applying V25.
WITH replacements(old_code, expected_orientation, expected_width, expected_height) AS (
    VALUES
        ('2026-reusable-daily-landscape', 'LANDSCAPE', 1024, 768),
        ('2026-reusable-daily-portrait', 'PORTRAIT', 768, 1024)
)
SELECT page.page_id, source.code AS source_code, page.canvas_width, page.canvas_height,
       replacement.expected_orientation, replacement.expected_width, replacement.expected_height
FROM pages page
JOIN page_templates source ON source.template_id = page.template_id
JOIN replacements replacement ON replacement.old_code = source.code
WHERE source.template_version = '1.0.0'
  AND (source.canvas_width IS DISTINCT FROM replacement.expected_width
       OR source.canvas_height IS DISTINCT FROM replacement.expected_height
       OR source.orientation IS DISTINCT FROM replacement.expected_orientation
       OR page.canvas_width IS DISTINCT FROM replacement.expected_width
       OR page.canvas_height IS DISTINCT FROM replacement.expected_height)
ORDER BY page.page_id;

-- Manual rollback for V25 page reassignment. Run only after previewing the following query.
-- Pages changed after V25 are deliberately excluded so this never overwrites newer user edits.

SELECT page.page_id, page.version, backup.previous_version, page.updated_at, backup.previous_updated_at
FROM pages page
JOIN page_template_v25_backups backup ON backup.page_id = page.page_id
WHERE page.version = backup.previous_version + 1
  AND page.template_id IN (
      SELECT template_id FROM page_templates
      WHERE code IN ('day-planner-landscape', 'day-planner-portrait') AND template_version = '1.0.0'
  )
ORDER BY page.page_id;

BEGIN;

UPDATE pages page
SET template_id = backup.previous_template_id,
    template_config = backup.previous_template_config,
    version = backup.previous_version,
    updated_at = backup.previous_updated_at
FROM page_template_v25_backups backup
WHERE backup.page_id = page.page_id
  AND page.version = backup.previous_version + 1
  AND page.template_id IN (
      SELECT template_id FROM page_templates
      WHERE code IN ('day-planner-landscape', 'day-planner-portrait') AND template_version = '1.0.0'
  );

COMMIT;

-- Retention: preserve page_template_v25_backups for 30 days after V25 deployment.
-- After the rollback window ends and operators have confirmed no rollback is required, run manually:
-- DROP TABLE page_template_v25_backups;
