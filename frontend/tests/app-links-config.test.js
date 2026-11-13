import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { sharedInviteUrl } from '../src/sharing/memberInviteLink.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = JSON.parse(read('../app.json')).expo;
const publicDir = '../../infra/nginx/prod/public/';

test('앱 링크: assetlinks 는 앱 패키지 · 서명 지문, AASA 는 번들 ID · /invite/* 를 가리킨다', () => {
  const [link] = JSON.parse(read(`${publicDir}.well-known/assetlinks.json`));
  assert.deepEqual(link.relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(link.target.namespace, 'android_app');
  assert.equal(link.target.package_name, app.android.package);
  assert.ok(link.target.sha256_cert_fingerprints.length > 0);
  for (const fingerprint of link.target.sha256_cert_fingerprints) assert.match(fingerprint, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);

  const [filter] = app.android.intentFilters;
  assert.equal(filter.autoVerify, true);
  assert.deepEqual(filter.data, [{ scheme: 'https', host: 'k15f106.p.ssafy.io', pathPrefix: '/invite/' }]);

  const [detail] = JSON.parse(read(`${publicDir}.well-known/apple-app-site-association`)).applinks.details;
  assert.match(detail.appID, new RegExp(`^[A-Z0-9]{10}\\.${app.ios.bundleIdentifier.replace(/\./g, '\\.')}$`));
  assert.deepEqual(detail.appIDs, [detail.appID]);
  assert.deepEqual(detail.paths, ['/invite/*']);
  assert.deepEqual(detail.components, [{ '/': '/invite/*' }]);
  assert.ok(app.ios.associatedDomains.includes('applinks:k15f106.p.ssafy.io'));
});

test('앱 링크: nginx 가 두 파일을 JSON 으로, /invite/ 는 안내 페이지로 내준다', () => {
  const conf = read('../../infra/nginx/prod/default.conf');
  for (const path of ['/.well-known/assetlinks.json', '/.well-known/apple-app-site-association']) {
    const start = conf.indexOf(`location = ${path} {`);
    assert.ok(start >= 0, path);
    const block = conf.slice(start, conf.indexOf('\n    }', start));
    assert.match(block, /root \/usr\/share\/nginx\/dio;\s+types \{ \}\s+default_type application\/json;/, path);
  }
  assert.match(conf, /location \^~ \/invite\/ \{\s+root \/usr\/share\/nginx\/dio;\s+try_files \$uri \/invite\/index\.html;/);
  assert.match(conf, /add_header Referrer-Policy "no-referrer";/);
  // location 에 add_header 가 있으면 server 수준 add_header 를 물려받지 않는다. server 에 헤더를 더하면 세 location 에도 넣는다.
  const server = conf.slice(conf.indexOf('listen 443'));
  assert.doesNotMatch(server.slice(0, server.indexOf('    location ')), /add_header/);
  assert.match(read('../../infra/nginx/prod/Dockerfile'), /COPY public\/ \/usr\/share\/nginx\/dio\//);
});

test('초대 안내 페이지: 앱과 같은 링크 형식만 받아들이고 외부로 보내지 않는다', () => {
  const script = read(`${publicDir}invite/invite.js`);
  const pattern = new RegExp(/var match = \/(.+)\/\.exec\(location\.pathname\);/.exec(script)[1].replace(/\\\//g, '/'));
  const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';
  for (const path of [`/invite/12.${token}`, '/invite/1.short', `/invite/0.${token}`, `/invite/12.${token}x`, `/invite/12.${token}/x`]) {
    assert.equal(pattern.test(path), sharedInviteUrl(`https://k15f106.p.ssafy.io${path}`) !== null, path);
  }
  assert.match(script, /'intent:\/\/' \+ HOST \+ path \+ '#Intent;scheme=https;package=' \+ PACKAGE \+ ';end'/);
  assert.match(script, /var PACKAGE = 'com\.f106\.DIO';/);
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|innerHTML|sendBeacon/);
  const html = read(`${publicDir}invite/index.html`);
  assert.doesNotMatch(html, /<script[^>]+src="https?:|<link[^>]+href="https?:/);
  // 빠진 파일은 try_files 때문에 404 대신 index.html 로 응답되어 드러나지 않는다
  const assets = [...html.matchAll(/(?:src|href)="(\/invite\/[^"]+)"/g)].map(([, asset]) => asset);
  assert.deepEqual(assets.sort(), ['/invite/dio.svg', '/invite/invite.js']);
  for (const asset of assets) assert.ok(existsSync(new URL(`${publicDir}${asset.slice(1)}`, import.meta.url)), asset);
});
