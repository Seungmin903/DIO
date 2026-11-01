-- Keep the former reusable daily templates for rollback and historical page records.
DO $planner_templates$
DECLARE
    seed RECORD;
    matches INTEGER;
BEGIN
    FOR seed IN
        SELECT * FROM (VALUES
            ('study-planner-landscape', '1.0.0', '스터디 플래너', 'STUDY', 'LANDSCAPE', 1024, 768, '{"width":1024,"height":768,"paperAppearance":{"backgroundColor":"#FFFFFF","layoutColor":"#292929"},"blank":false}'::jsonb, 288),
            ('study-planner-portrait', '1.0.0', '스터디 플래너', 'STUDY', 'PORTRAIT', 768, 1024, '{"width":768,"height":1024,"paperAppearance":{"backgroundColor":"#FFFFFF","layoutColor":"#292929"},"blank":false}'::jsonb, 289),
            ('day-planner-landscape', '1.0.0', '데일리 플래너', 'DAY', 'LANDSCAPE', 1024, 768, '{"width":1024,"height":768,"paperAppearance":{"backgroundColor":"#FFFFFF","layoutColor":"#292929"},"blank":false}'::jsonb, 290),
            ('day-planner-portrait', '1.0.0', '데일리 플래너', 'DAY', 'PORTRAIT', 768, 1024, '{"width":768,"height":1024,"paperAppearance":{"backgroundColor":"#FFFFFF","layoutColor":"#292929"},"blank":false}'::jsonb, 291)
        ) AS data(code, template_version, name, category, orientation, width, height, config, display_order)
    LOOP
        SELECT count(*) INTO matches
        FROM page_templates
        WHERE code = seed.code AND template_version = seed.template_version;

        IF matches > 1 THEN
            RAISE EXCEPTION 'Ambiguous page template: % / %', seed.code, seed.template_version;
        END IF;
        IF EXISTS (
            SELECT 1 FROM page_templates
            WHERE code = seed.code AND template_version = seed.template_version
              AND (canvas_width IS DISTINCT FROM seed.width OR canvas_height IS DISTINCT FROM seed.height
                   OR orientation IS DISTINCT FROM seed.orientation)
        ) THEN
            RAISE EXCEPTION 'Conflicting page template geometry: % / %', seed.code, seed.template_version;
        END IF;

        INSERT INTO page_templates(code, template_version, name, category, orientation, canvas_width, canvas_height, default_config, display_order)
        SELECT seed.code, seed.template_version, seed.name, seed.category, seed.orientation, seed.width, seed.height, seed.config, seed.display_order
        WHERE matches = 0;
    END LOOP;
END
$planner_templates$;

WITH replacements(old_code, new_code) AS (
    VALUES
        ('2026-reusable-daily-landscape', 'day-planner-landscape'),
        ('2026-reusable-daily-portrait', 'day-planner-portrait')
), targets AS (
    SELECT replacement.old_code, target.template_id, target.code, target.template_version
    FROM replacements replacement
    JOIN page_templates target
      ON target.code = replacement.new_code AND target.template_version = '1.0.0'
)
UPDATE pages page
SET template_id = target.template_id,
    template_config = CASE
        WHEN jsonb_typeof(page.template_config) = 'object' AND page.template_config ? 'templateCode'
            THEN jsonb_set(
                jsonb_set(page.template_config, '{templateCode}', to_jsonb(target.code), true),
                '{templateVersion}', to_jsonb(target.template_version), true
            )
        ELSE page.template_config
    END,
    version = page.version + 1,
    updated_at = CURRENT_TIMESTAMP
FROM page_templates source
JOIN targets target ON target.old_code = source.code
WHERE page.template_id = source.template_id
  AND source.template_version = '1.0.0';
