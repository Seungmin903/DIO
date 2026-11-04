import assert from 'node:assert/strict';
import { validateFirebaseAndroidConfig } from './verify-firebase-android-config.mjs';

const valid = {
  project_info: { project_number: '123', project_id: 'dio' },
  client: [{ client_info: { mobilesdk_app_id: '1:123:android:abc', android_client_info: { package_name: 'com.example.dio' } } }]
};

assert.doesNotThrow(() => validateFirebaseAndroidConfig(valid, JSON.stringify(valid)));
assert.throws(() => validateFirebaseAndroidConfig({ ...valid, client: [] }, JSON.stringify(valid)), /missing project or client metadata/);
assert.throws(() => validateFirebaseAndroidConfig({ ...valid, type: 'service_account' }, JSON.stringify(valid)), /Service-account credentials/);
assert.throws(() => validateFirebaseAndroidConfig({ ...valid, client: [{ ...valid.client[0], credentials: { private_key: 'value' } }] }, JSON.stringify(valid)), /Service-account credentials/);
assert.throws(() => validateFirebaseAndroidConfig(valid, '-----BEGIN PRIVATE KEY-----'), /Service-account credentials/);
