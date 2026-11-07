-- 편집기 "페이지 추가"로 만든 페이지는 template_id 없이 설정(template_config)의 templateCode · templateVersion 글자로만 속지를 가리켰다.
-- 그 글자에 맞는 page_templates 행을 찾아 template_id 를 채운다. 이후 새 페이지는 서버가 같은 방식으로 채운다(PageService.create).
-- 설정의 templateCode · templateVersion 은 지우지 않는다(옛 앱이 읽는다). 맞는 행이 없거나 같은 코드 · 버전 행이 여럿이면 건드리지 않는다.
-- 되돌리기: page_template_v35_links 에 남긴 페이지의 template_id 를 NULL 로, version · updated_at 을 previous_* 로 돌린다.
CREATE TABLE page_template_v35_links (
    page_id UUID PRIMARY KEY,
    linked_template_id BIGINT NOT NULL,
    previous_version BIGINT NOT NULL,
    previous_updated_at TIMESTAMPTZ(6) NOT NULL,
    linked_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TEMPORARY TABLE v35_targets ON COMMIT DROP AS
SELECT page.page_id, (array_agg(template.template_id))[1] AS template_id
FROM pages page
JOIN page_templates template
  ON template.code = page.template_config->>'templateCode'
 AND template.template_version = page.template_config->>'templateVersion'
WHERE page.template_id IS NULL
  AND jsonb_typeof(page.template_config->'templateCode') = 'string'
  AND jsonb_typeof(page.template_config->'templateVersion') = 'string'
GROUP BY page.page_id
HAVING count(*) = 1;

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
