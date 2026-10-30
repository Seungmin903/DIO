-- 격리 구현 초안: 발송 worker는 포함하지 않는다. 번호는 제출 시 최신 develop과 재확인한다.
CREATE TABLE push_installations (
    installation_id UUID PRIMARY KEY,
    environment VARCHAR(32) NOT NULL,
    app_id VARCHAR(160) NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    credential_hash BYTEA NOT NULL CHECK (octet_length(credential_hash) = 32),
    provider VARCHAR(16) NOT NULL CHECK (provider = 'EXPO'),
    platform VARCHAR(16) NOT NULL CHECK (platform IN ('ANDROID','IOS')),
    token_ciphertext BYTEA,
    token_key_id VARCHAR(64),
    token_cipher_format SMALLINT,
    token_hash BYTEA CHECK (token_hash IS NULL OR octet_length(token_hash) = 32),
    permission VARCHAR(16) NOT NULL CHECK (permission IN ('GRANTED','DENIED','UNDETERMINED')),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    binding_version BIGINT NOT NULL CHECK (binding_version > 0),
    token_version BIGINT NOT NULL CHECK (token_version > 0),
    created_at TIMESTAMPTZ(6) NOT NULL,
    updated_at TIMESTAMPTZ(6) NOT NULL,
    disabled_at TIMESTAMPTZ(6),
    CHECK ((token_ciphertext IS NULL) = (token_hash IS NULL)),
    CHECK ((token_ciphertext IS NULL AND token_key_id IS NULL AND token_cipher_format IS NULL) OR (token_ciphertext IS NOT NULL AND token_key_id IS NOT NULL AND token_cipher_format IS NOT NULL AND token_cipher_format IN (0,1))),
    CHECK (NOT enabled OR (token_hash IS NOT NULL AND permission = 'GRANTED' AND disabled_at IS NULL)),
    UNIQUE (environment, provider, token_hash)
);
CREATE INDEX idx_push_installations_session ON push_installations(session_id);
CREATE TABLE push_registration_requests (
    session_id UUID NOT NULL,
    installation_id UUID NOT NULL,
    request_id UUID NOT NULL,
    request_hash BYTEA NOT NULL CHECK (octet_length(request_hash) = 32),
    encrypted_response BYTEA,
    response_key_id VARCHAR(64),
    response_cipher_format SMALLINT,
    expires_at TIMESTAMPTZ(6) NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL,
    PRIMARY KEY (session_id, installation_id, request_id),
    CHECK ((encrypted_response IS NULL AND response_key_id IS NULL AND response_cipher_format IS NULL) OR (encrypted_response IS NOT NULL AND response_key_id IS NOT NULL AND response_cipher_format IS NOT NULL AND response_cipher_format IN (0,1)))
);
CREATE INDEX idx_push_registration_expiry ON push_registration_requests(expires_at) WHERE encrypted_response IS NOT NULL;
CREATE INDEX idx_push_registration_rotation ON push_registration_requests(installation_id, expires_at) WHERE encrypted_response IS NOT NULL;
CREATE TABLE push_outbox (
    outbox_id UUID PRIMARY KEY,
    event_key VARCHAR(255) NOT NULL UNIQUE,
    notification_id BIGINT REFERENCES notifications(notification_id) ON DELETE SET NULL,
    recipient_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    reference_id VARCHAR(255),
    status VARCHAR(24) NOT NULL CHECK (status IN ('PENDING','CANCELLED','COMPLETE')),
    created_at TIMESTAMPTZ(6) NOT NULL,
    expires_at TIMESTAMPTZ(6) NOT NULL CHECK (expires_at > created_at)
);
CREATE TABLE push_deliveries (
    outbox_id UUID NOT NULL REFERENCES push_outbox(outbox_id) ON DELETE CASCADE,
    installation_id UUID NOT NULL REFERENCES push_installations(installation_id) ON DELETE CASCADE,
    binding_version BIGINT NOT NULL CHECK (binding_version > 0),
    token_version BIGINT NOT NULL CHECK (token_version > 0),
    status VARCHAR(24) NOT NULL CHECK (status IN ('PENDING','LEASED','SENT','CANCELLED','FAILED')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at TIMESTAMPTZ(6), lease_until TIMESTAMPTZ(6), lease_id UUID,
    provider_ticket_id VARCHAR(255), result_code VARCHAR(128),
    PRIMARY KEY (outbox_id, installation_id, binding_version)
);
CREATE INDEX idx_push_deliveries_due ON push_deliveries(status, next_attempt_at);

-- 기기 변경 재시도의 requestId는 세션·설치별로 고정하며 최초 응답과 분리한다.
CREATE TABLE push_mutation_requests (
    session_id UUID NOT NULL,
    installation_id UUID NOT NULL,
    request_id UUID NOT NULL,
    request_hash BYTEA NOT NULL CHECK (octet_length(request_hash) = 32),
    operation VARCHAR(16) NOT NULL CHECK (operation IN ('UPDATE','BIND','UNBIND')),
    binding_version BIGINT NOT NULL CHECK (binding_version > 0),
    token_version BIGINT NOT NULL CHECK (token_version > 0),
    result_provider VARCHAR(16) NOT NULL,
    result_platform VARCHAR(16) NOT NULL,
    result_permission VARCHAR(16) NOT NULL,
    result_enabled BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL,
    PRIMARY KEY (session_id, installation_id, request_id)
);
