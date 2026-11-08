-- V35(페이지 추가의 속지 코드를 속지 행에 연결) 수동 되돌리기.
-- V35 는 template_id 가 비어 있던 페이지에 속지 행을 연결하고 version · updated_at 을 올렸다(page_template_v35_links 에 기록).
-- 되돌리기는 V35 뒤에 다시 수정되지 않은 페이지(version 이 previous_version + 1 그대로이고 template_id 가 연결한 행 그대로)만
-- template_id 를 NULL 로, version · updated_at 을 V35 이전 값으로 돌린다. 그 뒤 수정된 페이지는 건드리지 않는다
-- (version 을 뒤로 돌리면 구성원 앱의 버전 비교가 어긋나 최신 변경을 놓친다). 설정(template_config)은 V35 가 바꾸지 않았으므로 그대로다.
--
-- 1) 되돌릴 페이지와 건너뛸 페이지 미리 보기(읽기만 한다)
SELECT link.page_id,
       link.linked_template_id,
       page.template_id AS current_template_id,
       link.previous_version,
       page.version AS current_version,
       (page.version = link.previous_version + 1 AND page.template_id = link.linked_template_id) AS will_restore
FROM page_template_v35_links link
JOIN pages page ON page.page_id = link.page_id
ORDER BY will_restore DESC, link.page_id;

-- Manual rollback for V35 page links.
BEGIN;

UPDATE pages page
SET template_id = NULL,
    version = link.previous_version,
    updated_at = link.previous_updated_at
FROM page_template_v35_links link
WHERE link.page_id = page.page_id
  AND page.version = link.previous_version + 1
  AND page.template_id = link.linked_template_id;

COMMIT;

-- 보관: page_template_v35_links 는 V35 배포 뒤 30일 동안 둔다.
-- 되돌릴 필요가 없다고 확인되면 직접 실행한다:
-- DROP TABLE page_template_v35_links;
