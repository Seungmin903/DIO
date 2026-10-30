-- Test fixture only: upgrade the checksum-verified legacy V21, never replace an applied V21.
ALTER TABLE push_installations ADD COLUMN token_key_id VARCHAR(64);
ALTER TABLE push_installations ADD COLUMN token_cipher_format SMALLINT;
UPDATE push_installations SET token_key_id='legacy',token_cipher_format=0 WHERE token_ciphertext IS NOT NULL;
ALTER TABLE push_installations ADD CONSTRAINT push_token_cipher_metadata CHECK (
    (token_ciphertext IS NULL AND token_key_id IS NULL AND token_cipher_format IS NULL) OR
    (token_ciphertext IS NOT NULL AND token_key_id IS NOT NULL AND token_cipher_format IS NOT NULL AND token_cipher_format IN (0,1))
);
ALTER TABLE push_registration_requests ADD COLUMN response_key_id VARCHAR(64);
ALTER TABLE push_registration_requests ADD COLUMN response_cipher_format SMALLINT;
UPDATE push_registration_requests SET response_key_id='legacy',response_cipher_format=0 WHERE encrypted_response IS NOT NULL;
ALTER TABLE push_registration_requests ADD CONSTRAINT push_response_cipher_metadata CHECK (
    (encrypted_response IS NULL AND response_key_id IS NULL AND response_cipher_format IS NULL) OR
    (encrypted_response IS NOT NULL AND response_key_id IS NOT NULL AND response_cipher_format IS NOT NULL AND response_cipher_format IN (0,1))
);
CREATE INDEX idx_push_registration_rotation ON push_registration_requests(installation_id, expires_at) WHERE encrypted_response IS NOT NULL;

-- Fixture-only: preserve prior delivery cleanup behavior when the legacy installation is deleted.
ALTER TABLE push_deliveries DROP CONSTRAINT push_deliveries_installation_id_fkey;
ALTER TABLE push_deliveries ADD CONSTRAINT push_deliveries_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES push_installations(installation_id) ON DELETE CASCADE;
