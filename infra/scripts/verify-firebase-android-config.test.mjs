import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateFirebaseAndroidConfig, validateFirebaseAndroidConfigFile } from './verify-firebase-android-config.mjs';

const valid = {
  project_info: { project_number: '123', project_id: 'dio' },
  client: [{ client_info: { mobilesdk_app_id: '1:123:android:abc', android_client_info: { package_name: 'com.example.dio' } } }]
};

assert.doesNotThrow(() => validateFirebaseAndroidConfig(valid, JSON.stringify(valid), 'com.example.dio'));
assert.throws(() => validateFirebaseAndroidConfig({ ...valid, client: [] }, JSON.stringify(valid), 'com.example.dio'), /missing project or client metadata/);
assert.throws(() => validateFirebaseAndroidConfig(valid, JSON.stringify(valid), 'com.example.other'), /has no client/);
assert.throws(() => validateFirebaseAndroidConfig({ ...valid, type: 'service_account' }, JSON.stringify(valid), 'com.example.dio'), /Service-account credentials/);
for (const field of ['private_key', 'private_key_id', 'client_email', 'token_uri']) {
  assert.throws(() => validateFirebaseAndroidConfig({ ...valid, credentials: { [field]: 'value' } }, JSON.stringify(valid), 'com.example.dio'), /Service-account credentials/);
}
const pemMarker = `-----BEGIN ${'PRIVATE'} KEY-----`;
assert.throws(() => validateFirebaseAndroidConfig(valid, pemMarker, 'com.example.dio'), /Service-account credentials/);

const directory = mkdtempSync(join(tmpdir(), 'dio-firebase-config-'));
try {
  const validPath = join(directory, 'valid.json');
  const invalidPath = join(directory, 'invalid.json');
  const pemPath = join(directory, 'private.pem');
  writeFileSync(validPath, JSON.stringify(valid));
  writeFileSync(invalidPath, '{');
  writeFileSync(pemPath, pemMarker);
  assert.deepEqual(validateFirebaseAndroidConfigFile(validPath).config, valid);
  assert.throws(() => validateFirebaseAndroidConfigFile(invalidPath), /Invalid Firebase Android JSON/);
  assert.throws(() => validateFirebaseAndroidConfigFile(pemPath), /Service-account credentials/);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
