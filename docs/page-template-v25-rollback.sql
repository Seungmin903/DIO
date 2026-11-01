-- Manual rollback for V25 page reassignment. Run only after previewing the first query.
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
