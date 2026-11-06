-- 원격 속지(앱 배포 없이 에셋 저장소에 올린 속지)용 범용 템플릿 행. 방향마다 하나씩 둔다.
-- 페이지 template_config 의 remoteTemplate(속지 id)으로 앱이 catalog.json 에서 그림을 찾는다.
-- V32 는 다른 작업(신고 증빙 보관)이 쓰고 있어 비워 둔다.
DO $remote_templates$
DECLARE
    seed RECORD;
    matches INTEGER;
    base_order INTEGER;
BEGIN
    SELECT COALESCE(MAX(display_order), 0) INTO base_order FROM page_templates;
    FOR seed IN
        SELECT * FROM (VALUES
            ('dio-remote-landscape', '1.0.0', '추가 속지 · 가로', 'REMOTE', 'LANDSCAPE', 1024, 768, '{"width":1024,"height":768,"paperAppearance":{"backgroundColor":"#FFFFFF","layoutColor":"#292929"},"blank":false}'::jsonb, 1),
            ('dio-remote-portrait', '1.0.0', '추가 속지 · 세로', 'REMOTE', 'PORTRAIT', 768, 1024, '{"width":768,"height":1024,"paperAppearance":{"backgroundColor":"#FFFFFF","layoutColor":"#292929"},"blank":false}'::jsonb, 2)
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
$remote_templates$;
