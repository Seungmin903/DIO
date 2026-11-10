-- 꾸미기 공방 도구 탭 팔레트(펜 · 형광펜 · 테이프 · 글자 · 종이 · 줄 색의 고정 칸). 계정마다 문서 한 벌.
-- 계정 행이 지워지면 함께 지운다(탈퇴는 UserWithdrawalDataRepository 가 먼저 지운다).
CREATE TABLE user_palettes (
    user_id BIGINT NOT NULL,
    version BIGINT NOT NULL,
    document_json TEXT NOT NULL,
    updated_at TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT pk_user_palettes PRIMARY KEY (user_id),
    CONSTRAINT fk_user_palettes_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
);
