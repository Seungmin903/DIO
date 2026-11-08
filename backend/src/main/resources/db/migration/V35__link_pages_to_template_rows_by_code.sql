-- 편집기 "페이지 추가"로 만든 페이지는 template_id 없이 설정(template_config)의 templateCode · templateVersion 글자로만 속지를 가리켰다.
-- 그 글자에 맞는 page_templates 행을 찾아 template_id 를 채운다. 이후 새 페이지는 서버가 같은 방식으로 채운다(PageService.create).
-- 설정의 templateCode · templateVersion 은 지우지 않는다(옛 앱이 읽는다).
--
-- 연결 조건(하나라도 어긋나면 그 페이지는 건드리지 않는다. 마이그레이션은 실패하지 않는다)
--   1. 코드 · 버전이 같고 캔버스 크기(가로 · 세로)도 같은 행만 후보다. 크기가 다른 행에 연결하면 template_id 와 페이지 크기가 어긋난다.
--   2. 후보 중 활성 행이 정확히 하나면 그 행(서비스의 페이지 추가와 같은 기준).
--   3. 활성 행이 없고 비활성 행만 정확히 하나면 그 행. 페이지를 만들 때는 쓰던 속지가 나중에 내려간 경우로, 페이지는 그 속지를 계속 가리킨다(페이지 응답은 비활성 행도 읽는다).
--   4. 그 밖(활성 행 여럿, 비활성 행만 여럿)은 어느 행인지 정할 수 없어 건너뛴다.
-- 되돌리기: docs/page-template-v35-rollback.sql. V35 뒤에 다시 수정되지 않은 페이지만 template_id 를 NULL 로, version · updated_at 을 이전 값으로 돌린다.
CREATE TABLE page_template_v35_links (
    page_id UUID PRIMARY KEY,
    linked_template_id BIGINT NOT NULL,
    previous_version BIGINT NOT NULL,
    previous_updated_at TIMESTAMPTZ(6) NOT NULL,
    linked_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TEMPORARY TABLE v35_targets ON COMMIT DROP AS
WITH candidates AS (
    SELECT page.page_id, template.template_id, template.is_active
    FROM pages page
    JOIN page_templates template
      ON template.code = page.template_config->>'templateCode'
     AND template.template_version = page.template_config->>'templateVersion'
     AND template.canvas_width = page.canvas_width
     AND template.canvas_height = page.canvas_height
    WHERE page.template_id IS NULL
      AND jsonb_typeof(page.template_config->'templateCode') = 'string'
      AND jsonb_typeof(page.template_config->'templateVersion') = 'string'
), counted AS (
    SELECT page_id,
           count(*) FILTER (WHERE is_active) AS active_count,
           count(*) AS total_count,
           min(template_id) FILTER (WHERE is_active) AS active_id,
           min(template_id) AS any_id
    FROM candidates
    GROUP BY page_id
)
SELECT page_id, CASE WHEN active_count = 1 THEN active_id ELSE any_id END AS template_id
FROM counted
WHERE active_count = 1 OR (active_count = 0 AND total_count = 1);

INSERT INTO page_template_v35_links(page_id, linked_template_id, previous_version, previous_updated_at)
SELECT page.page_id, target.template_id, page.version, page.updated_at
FROM pages page
JOIN v35_targets target ON target.page_id = page.page_id;

-- 페이지 정보가 바뀌었음을 구성원 앱이 알도록 version · updated_at 을 올린다(V27 과 같다)
UPDATE pages page
SET template_id = target.template_id,
    version = page.version + 1,
    updated_at = CURRENT_TIMESTAMP
FROM v35_targets target
WHERE target.page_id = page.page_id;
