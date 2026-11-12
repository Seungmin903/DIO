-- 발색 기록 속지(잉크병을 칠하면 잉크 · 글리터 · 테 색이 저절로 채워지는 속지,
-- frontend/src/editor/templates/inkRecord.js)용 템플릿 행. 병 모양 2종 x 방향 2종 = 4행.
-- 프런트 카탈로그(serverCatalog.js)의 2026-reusable-ink-record-* 행과 코드 · 규격 · 기본 설정이 같아야 한다
-- (frontend/tests/server-template-catalog.test.js 가 확인).
-- 배포 순서는 V36 여행 노선과 같다: 렌더러만 있는 프런트(EXPO_PUBLIC_INK_RECORD_TEMPLATES_ENABLED=0)
-- → 이 마이그레이션 → 선택 켜기.
-- 번호는 병합 시점의 develop · release 최신 마이그레이션 다음으로 맞춘다. 한 환경이라도 배포한 뒤에는 번호를 바꾸지 않는다.
DO $ink_record_templates$
DECLARE
    seed RECORD;
    matches INTEGER;
    base_order INTEGER;
BEGIN
    SELECT COALESCE(MAX(display_order), 0) INTO base_order FROM page_templates;
    FOR seed IN
        SELECT * FROM (VALUES
            ('2026-reusable-ink-record-round-portrait', '1.0.0', '발색 기록 · 둥근 병', 'INKRECORD', 'PORTRAIT', 768, 1024, '{"width":768,"height":1024,"paperAppearance":{"backgroundColor":"#FFFFFF","layoutColor":"#292929"},"blank":false}'::jsonb, 1),
            ('2026-reusable-ink-record-square-portrait', '1.0.0', '발색 기록 · 각진 병', 'INKRECORD', 'PORTRAIT', 768, 1024, '{"width":768,"height":1024,"paperAppearance":{"backgroundColor":"#FFFFFF","layoutColor":"#292929"},"blank":false}'::jsonb, 2),
            ('2026-reusable-ink-record-round-landscape', '1.0.0', '발색 기록 · 둥근 병', 'INKRECORD', 'LANDSCAPE', 1024, 768, '{"width":1024,"height":768,"paperAppearance":{"backgroundColor":"#FFFFFF","layoutColor":"#292929"},"blank":false}'::jsonb, 3),
            ('2026-reusable-ink-record-square-landscape', '1.0.0', '발색 기록 · 각진 병', 'INKRECORD', 'LANDSCAPE', 1024, 768, '{"width":1024,"height":768,"paperAppearance":{"backgroundColor":"#FFFFFF","layoutColor":"#292929"},"blank":false}'::jsonb, 4)
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
        -- 이미 있는 행이 비활성이면 건너뛰어도 활성 행이 0개가 되어, 마이그레이션은 성공해도
        -- 페이지 추가가 400 UNKNOWN_PAGE_TEMPLATE 으로 막힌다. 조용히 넘어가지 않고 멈춘다.
        IF EXISTS (
            SELECT 1 FROM page_templates
            WHERE code = seed.code AND template_version = seed.template_version AND NOT is_active
        ) THEN
            RAISE EXCEPTION 'Inactive page template would stay inactive: % / %', seed.code, seed.template_version;
        END IF;

        INSERT INTO page_templates(code, template_version, name, category, orientation, canvas_width, canvas_height, default_config, display_order)
        SELECT seed.code, seed.template_version, seed.name, seed.category, seed.orientation, seed.width, seed.height, seed.config, base_order + seed.display_order_offset
        WHERE matches = 0;
    END LOOP;
END
$ink_record_templates$;
