import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const privateKeyPattern = /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/;
const serviceAccountFields = new Set(['private_key', 'private_key_id', 'client_email', 'token_uri']);

function hasServiceAccountField(value) {
  if (Array.isArray(value)) return value.some(hasServiceAccountField);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, nested]) => serviceAccountFields.has(key) || hasServiceAccountField(nested));
  }
  return false;
}

export function validateFirebaseAndroidConfig(config, raw) {
  if (!config?.project_info?.project_number || !config?.project_info?.project_id
    || !Array.isArray(config.client) || config.client.length === 0) {
    throw new Error('Firebase Android config is missing project or client metadata');
  }

  for (const client of config.client) {
    if (!client?.client_info?.mobilesdk_app_id || !client?.client_info?.android_client_info?.package_name) {
      throw new Error('Firebase Android config contains an invalid client entry');
    }
  }

  if (config.type === 'service_account' || hasServiceAccountField(config) || privateKeyPattern.test(raw)) {
    throw new Error('Service-account credentials must not be committed as Firebase Android config');
  }
}

export function validateFirebaseAndroidConfigFile(path) {
  let raw;
  let config;
  try {
    raw = readFileSync(path, 'utf8');
    config = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid Firebase Android JSON: ${error.message}`);
  }
  validateFirebaseAndroidConfig(config, raw);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) throw new Error('Firebase Android config path is required');
  validateFirebaseAndroidConfigFile(path);
}
