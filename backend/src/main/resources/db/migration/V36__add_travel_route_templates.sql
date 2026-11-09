-- 여행 노선 속지(코드로 그리는 플래너 속지, frontend/src/editor/templates/routePaper.js)용 템플릿 행. 방향마다 하나씩 둔다.
-- 프런트 카탈로그(serverCatalog.js)의 route-planner-* 행과 코드 · 규격 · 기본 설정이 같아야 한다(tests/server-template-catalog.test.js 가 확인).
-- 배포 순서는 V27 플래너와 같다: 렌더러만 있는 프런트(EXPO_PUBLIC_ROUTE_TEMPLATES_ENABLED=0) → 이 마이그레이션 → 선택 켜기.
-- 번호는 병합 시점의 develop · release 최신 마이그레이션 다음으로 맞춘다. 한 환경이라도 배포한 뒤에는 번호를 바꾸지 않는다.
DO $route_templates$
DECLARE
    seed RECORD;
    matches INTEGER;
    base_order INTEGER;
BEGIN
    SELECT COALESCE(MAX(display_order), 0) INTO base_order FROM page_templates;
    FOR seed IN
        SELECT * FROM (VALUES
            ('route-planner-landscape', '1.0.0', '여행 노선', 'ROUTE', 'LANDSCAPE', 1024, 768, '{"width":1024,"height":768,"paperAppearance":{"backgroundColor":"#FFFFFF","layoutColor":"#292929"},"blank":false}'::jsonb, 1),
            ('route-planner-portrait', '1.0.0', '여행 노선', 'ROUTE', 'PORTRAIT', 768, 1024, '{"width":768,"height":1024,"paperAppearance":{"backgroundColor":"#FFFFFF","layoutColor":"#292929"},"blank":false}'::jsonb, 2)
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
$route_templates$;
