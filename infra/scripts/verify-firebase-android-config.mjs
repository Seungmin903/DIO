import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) throw new Error('Firebase Android config path is required');

let config;
try {
  config = JSON.parse(readFileSync(path, 'utf8'));
} catch (error) {
  throw new Error(`Invalid Firebase Android JSON: ${error.message}`);
}

if (!config?.project_info?.project_number || !config?.project_info?.project_id
  || !Array.isArray(config.client) || config.client.length === 0) {
  throw new Error('Firebase Android config is missing project or client metadata');
}

for (const client of config.client) {
  if (!client?.client_info?.mobilesdk_app_id || !client?.client_info?.android_client_info?.package_name) {
    throw new Error('Firebase Android config contains an invalid client entry');
  }
}

const forbidden = ['private_key', 'private_key_id', 'client_email', 'token_uri'];
if (forbidden.some((key) => Object.hasOwn(config, key))) {
  throw new Error('Service-account credentials must not be committed as Firebase Android config');
}
