-- 다이어리 단위 속지 구성(고른 속지 묶음·날짜 표시 방식·방향). 페이지별 template_config와 별개로, 다른 기기의 속지 요약·첫 속지 미리보기에 쓴다.
ALTER TABLE diaries ADD COLUMN template_config_json text;
