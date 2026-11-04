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

export function validateFirebaseAndroidConfig(config, raw, expectedPackage) {
  if (!config?.project_info?.project_number || !config?.project_info?.project_id
    || !Array.isArray(config.client) || config.client.length === 0) {
    throw new Error('Firebase Android config is missing project or client metadata');
  }

  for (const client of config.client) {
    if (!client?.client_info?.mobilesdk_app_id || !client?.client_info?.android_client_info?.package_name) {
      throw new Error('Firebase Android config contains an invalid client entry');
    }
  }

  if (!config.client.some((client) => client.client_info.android_client_info.package_name === expectedPackage)) {
    throw new Error(`Firebase Android config has no client for ${expectedPackage}`);
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
    if (privateKeyPattern.test(raw)) {
      throw new Error('Service-account credentials must not be committed as Firebase Android config');
    }
    config = JSON.parse(raw);
  } catch (error) {
    if (error.message === 'Service-account credentials must not be committed as Firebase Android config') throw error;
    throw new Error(`Invalid Firebase Android JSON: ${error.message}`);
  }
  return { config, raw };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [firebasePath, appConfigPath] = process.argv.slice(2);
  if (!firebasePath || !appConfigPath) throw new Error('Firebase Android and Expo app config paths are required');
  const { config, raw } = validateFirebaseAndroidConfigFile(firebasePath);
  let appConfig;
  try {
    appConfig = JSON.parse(readFileSync(appConfigPath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid Expo app JSON: ${error.message}`);
  }
  const expectedPackage = appConfig?.expo?.android?.package;
  if (!expectedPackage) throw new Error('Expo Android package is required');
  validateFirebaseAndroidConfig(config, raw, expectedPackage);
}
