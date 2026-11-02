-- Keep the former reusable daily templates for rollback and historical page records.
CREATE TABLE page_template_v25_backups (
    page_id UUID PRIMARY KEY,
    previous_template_id BIGINT,
    previous_template_config JSONB,
    previous_version BIGINT NOT NULL,
    previous_updated_at TIMESTAMPTZ(6) NOT NULL,
    backed_up_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $planner_templates$
DECLARE
    seed RECORD;
    matches INTEGER;
    base_order INTEGER;
BEGIN
    SELECT COALESCE(MAX(display_order), 0) INTO base_order FROM page_templates;
    FOR seed IN
        SELECT * FROM (VALUES
            ('study-planner-landscape', '1.0.0', '스터디 플래너', 'STUDY', 'LANDSCAPE', 1024, 768, '{"width":1024,"height":768,"paperAppearance":{"backgroundColor":"#FFFFFF","layoutColor":"#292929"},"blank":false}'::jsonb, 1),
            ('study-planner-portrait', '1.0.0', '스터디 플래너', 'STUDY', 'PORTRAIT', 768, 1024, '{"width":768,"height":1024,"paperAppearance":{"backgroundColor":"#FFFFFF","layoutColor":"#292929"},"blank":false}'::jsonb, 2),
            ('day-planner-landscape', '1.0.0', '데일리 플래너', 'DAY', 'LANDSCAPE', 1024, 768, '{"width":1024,"height":768,"paperAppearance":{"backgroundColor":"#FFFFFF","layoutColor":"#292929"},"blank":false}'::jsonb, 3),
            ('day-planner-portrait', '1.0.0', '데일리 플래너', 'DAY', 'PORTRAIT', 768, 1024, '{"width":768,"height":1024,"paperAppearance":{"backgroundColor":"#FFFFFF","layoutColor":"#292929"},"blank":false}'::jsonb, 4)
        ) AS data(code, template_version, name, category, orientation, width, height, config, display_order_offset)
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
        SELECT seed.code, seed.template_version, seed.name, seed.category, seed.orientation, seed.width, seed.height, seed.config, base_order + seed.display_order_offset
        WHERE matches = 0;
    END LOOP;
END
$planner_templates$;

-- Do not change a page when either its source template or its own canvas differs from the replacement.
DO $planner_compatibility$
DECLARE
    mismatch_count BIGINT;
    mismatch_page_ids TEXT;
BEGIN
    WITH replacements(old_code, new_code) AS (
        VALUES
            ('2026-reusable-daily-landscape', 'day-planner-landscape'),
            ('2026-reusable-daily-portrait', 'day-planner-portrait')
    ), mismatches AS (
        SELECT page.page_id
        FROM pages page
        JOIN page_templates source ON source.template_id = page.template_id
        JOIN replacements replacement ON replacement.old_code = source.code
        JOIN page_templates target ON target.code = replacement.new_code AND target.template_version = '1.0.0'
        WHERE source.template_version = '1.0.0'
          AND (source.canvas_width IS DISTINCT FROM target.canvas_width
               OR source.canvas_height IS DISTINCT FROM target.canvas_height
               OR source.orientation IS DISTINCT FROM target.orientation
               OR page.canvas_width IS DISTINCT FROM target.canvas_width
               OR page.canvas_height IS DISTINCT FROM target.canvas_height)
    )
    SELECT
        (SELECT count(*) FROM mismatches),
        (SELECT string_agg(left(page_id::text, 8), ',' ORDER BY page_id)
         FROM (SELECT page_id FROM mismatches ORDER BY page_id LIMIT 10) sample)
    INTO mismatch_count, mismatch_page_ids;

    IF mismatch_count > 0 THEN
        RAISE EXCEPTION 'Reusable daily page geometry mismatch: count=%, page_ids=%', mismatch_count, mismatch_page_ids
            USING HINT = 'Run docs/page-template-v25-rollback.sql preflight query before retrying V25.';
    END IF;
END
$planner_compatibility$;

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
INSERT INTO page_template_v25_backups(page_id, previous_template_id, previous_template_config, previous_version, previous_updated_at)
SELECT page.page_id, page.template_id, page.template_config, page.version, page.updated_at
FROM pages page
JOIN page_templates source ON source.template_id = page.template_id
JOIN targets target ON target.old_code = source.code
WHERE source.template_version = '1.0.0'
ON CONFLICT (page_id) DO NOTHING;

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
