CREATE TABLE block_warning_dismissals (
    diary_id UUID NOT NULL REFERENCES diaries(diary_id) ON DELETE CASCADE,
    blocker_user_id BIGINT NOT NULL,
    blocked_user_id BIGINT NOT NULL,
    PRIMARY KEY (diary_id, blocker_user_id, blocked_user_id),
    FOREIGN KEY (blocker_user_id, blocked_user_id)
        REFERENCES user_blocks(blocker_user_id, blocked_user_id) ON DELETE CASCADE
);

CREATE INDEX ix_block_warning_dismissals_block
    ON block_warning_dismissals(blocker_user_id, blocked_user_id);
