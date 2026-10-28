-- Retain key tombstones after response expiry so an old request cannot create another diary.
CREATE TABLE diary_creation_requests (
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    request_key UUID NOT NULL,
    request_hash CHAR(64) NOT NULL,
    diary_id UUID NOT NULL,
    response_body TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (user_id, request_key),
    CHECK (expires_at > created_at)
);
-- No diary FK: permanent deletion must not allow reuse of an earlier creation key.
CREATE INDEX diary_creation_response_expiry_idx ON diary_creation_requests(expires_at)
    WHERE response_body IS NOT NULL;
