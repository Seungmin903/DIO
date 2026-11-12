import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNotificationHttpTransport, createServerNotificationApi } from '../src/notifications/serverNotificationApi.js';

// 이 파일은 생성된 실제 Spring 응답이 필수다. 일반 fixture로 조용히 대체하거나 skip하지 않는다.
if (!process.env.DIO_NOTIFICATION_CONTRACT_OUTPUT) throw new Error('pnpm test:notifications:contract로 Spring 응답을 먼저 생성해 주세요.');
const captured = JSON.parse(readFileSync(process.env.DIO_NOTIFICATION_CONTRACT_OUTPUT, 'utf8'));
assert.equal(captured.producer, 'Spring MockMvc/H2');
const paths = captured.openapi.paths;
const schemaTypes = schema => Array.isArray(schema.type) ? schema.type : [schema.type];
function apiFor(name) {
  const response = captured.cases[name];
  assert.ok(response, `Spring 응답 누락: ${name}`);
  return createServerNotificationApi(createNotificationHttpTransport({ baseUrl: 'https://contract.test/api/v1', getAccessToken: async () => 'contract-test-token',
    fetchImpl: async (url, options) => {
      const path = new URL(url).pathname;
      const key = path.replace(/\/\d+$/, '/{notificationId}');
      if (name !== 'oldRead') assert.ok(paths[key]?.[options.method.toLowerCase()], `OpenAPI에 없는 FE 요청: ${options.method} ${key}`);
      return new Response(response.status === 204 ? null : JSON.stringify(response.body), { status: response.status,
        headers: response.contentType ? { 'Content-Type': response.contentType } : {} });
    } }));
}

test('Spring 목록 DTO: 문자열 BIGINT·초대 true/false·null·마지막/빈 페이지', async () => {
  const first = await apiFor('first').list();
  assert.equal(first.items[0].id, '9007199254740993'); assert.equal(first.items[0].actionable, true);
  assert.equal(first.items[1].actionable, false); assert.equal(first.hasNext, true); assert.equal(typeof first.nextCursor, 'string');
  const last = await apiFor('last').list({ cursor: first.nextCursor });
  assert.equal(last.items.length, 2); assert.equal(last.items[0].inviteId, null); assert.equal(last.items[0].status, 'UNAVAILABLE');
  assert.equal(last.items[0].actionable, false); assert.equal(last.hasNext, false); assert.equal(last.nextCursor, null);
  assert.deepEqual((await apiFor('empty').list()).items, []);
});
test('Spring 카운트·읽음200 DTO·삭제204와 반복204를 FE가 소비한다', async () => {
  assert.deepEqual(await apiFor('count').count(), { unreadCount: 3, actionableUnreadCount: 0 });
  const read = await apiFor('read').read('90001');
  assert.equal(read.notificationId, '90001'); assert.equal(typeof read.readAt, 'string'); assert.equal(read.notificationType, 'DIARY_INVITE');
  assert.equal(await apiFor('delete').remove('90001'), null); assert.equal(await apiFor('deleteAgain').remove('90001'), null);
});
test('Spring 전체 읽음 준비 응답과 204 응답을 FE가 소비한다', async () => {
  const prepared = await apiFor('prepareReadAll').prepareReadAll();
  assert.match(prepared.readWatermark, /^[0-9a-f-]{36}$/);
  assert.ok(!Number.isNaN(Date.parse(prepared.expiresAt)));
  assert.equal(await apiFor('readAll').readAll(prepared.readWatermark), null);
  assert.ok(paths['/api/v1/notifications/read-watermarks'].post.responses['201']);
  assert.ok(paths['/api/v1/notifications/read-all'].post.responses['204']);
});
test('Spring ProblemDetail·프레임워크400의 code 부재를 FE 오류로 처리한다', async () => {
  for (const [name, status, code] of [['notFound', 404, 'NOTIFICATION_NOT_FOUND'], ['unauthorized', 401, 'AUTHENTICATION_REQUIRED'],
    ['invalidLimit', 400, 'INVALID_NOTIFICATION_LIMIT'], ['invalidType', 400, 'HTTP_ERROR']]) {
    const call = name === 'notFound' ? apiFor(name).read('90005') : apiFor(name).list();
    await assert.rejects(call, error => error.status === status && error.code === code);
  }
  assert.equal(captured.cases.oldRead.status, 404);
});
test('Spring OpenAPI는 PDF의4개 작업·응답 코드·cursor/limit를 노출하고 이전 읽음 경로를 제거한다', () => {
  for (const [path, method, status] of [['/api/v1/notifications', 'get', '200'], ['/api/v1/notifications/unread-count', 'get', '200'],
    ['/api/v1/notifications/{notificationId}', 'patch', '200'], ['/api/v1/notifications/{notificationId}', 'delete', '204']]) {
    assert.ok(paths[path]?.[method]?.responses?.[status], `${method} ${path}: ${status}`);
  }
  assert.equal(paths['/api/v1/notifications/{notificationId}/read'], undefined);
  const names = paths['/api/v1/notifications'].get.parameters.map(value => value.name).sort();
  assert.deepEqual(names, ['cursor', 'limit']);
  assert.equal(paths['/api/v1/notifications/{notificationId}'].patch.requestBody, undefined);
});

test('OpenAPI DTO 참조·필드 타입은 실제 Spring 응답과 FE 기대 형태에 맞는다', () => {
  const resolve = schema => schema.$ref ? captured.openapi.components.schemas[schema.$ref.split('/').at(-1)]
    : schema.anyOf ? resolve(schema.anyOf.find(value => !allowsNull(value))) : schema;
  const responseSchema = (path, method) => resolve(Object.values(paths[path][method].responses['200'].content)[0].schema);
  const list = responseSchema('/api/v1/notifications', 'get');
  assert.equal(list.properties.items.type, 'array'); assert.equal(list.properties.hasNext.type, 'boolean'); assert.ok(schemaTypes(list.properties.nextCursor).includes('string'));
  const item = resolve(list.properties.items.items), notification = resolve(item.properties.notification), invitation = resolve(item.properties.invitation);
  assert.equal(notification.properties.notificationId.type, 'string'); assert.ok(schemaTypes(notification.properties.actorUserId).includes('string'));
  assert.equal(notification.properties.createdAt.format, 'date-time'); assert.equal(notification.properties.readAt.format, 'date-time');
  assert.equal(invitation.properties.canOpen.type, 'boolean'); assert.equal(invitation.properties.inviteId.type, 'string');
  assert.equal(responseSchema('/api/v1/notifications/unread-count', 'get').properties.unreadCount.type, 'integer');
  assert.deepEqual(responseSchema('/api/v1/notifications/{notificationId}', 'patch'), notification);
});

function allowsNull(schema) {
  try { validateResponse(schema, null); return true; } catch { return false; }
}
// 알림 응답에 사용하는 object/array/primitive/$ref 부분집합 검증. nullable를 생략하면 null에서 실패한다.
function validateResponse(schema, value, path = '$') {
  // JSON Schema 2020-12의 $ref는 형제 키워드로 덮어쓰지 않는다. 둘 다 만족해야 한다.
  if (schema.$ref) validateResponse(captured.openapi.components.schemas[schema.$ref.split('/').at(-1)], value, path);
  if (schema.anyOf) assert.ok(schema.anyOf.some(option => { try { validateResponse(option, value, path); return true; } catch { return false; } }), `${path}: anyOf 불일치`);
  if (value === null) {
    if (schema.type !== undefined) assert.ok(schemaTypes(schema).includes('null'), `${path}: null 허용 명시 누락`);
    return;
  }
  const type = Array.isArray(value) ? 'array' : typeof value === 'number' && Number.isInteger(value) ? 'integer' : typeof value;
  if (schema.type !== undefined) assert.ok(schemaTypes(schema).includes(type), `${path}: ${type} 타입 불일치`);
  if (schema.enum) assert.ok(schema.enum.includes(value), `${path}: enum 값 불일치`);
  if (type === 'object') for (const key of schema.required ?? []) assert.ok(Object.hasOwn(value, key), `${path}.${key}: required 필드 누락`);
  if (type === 'array' && schema.items) value.forEach((row, index) => validateResponse(schema.items, row, `${path}[${index}]`));
  if (type === 'object' && schema.properties) for (const [key, field] of Object.entries(value)) {
    assert.ok(schema.properties?.[key], `${path}.${key}: schema 필드 누락`);
    validateResponse(schema.properties[key], field, `${path}.${key}`);
  }
}

test('OpenAPI 3.1 nullable 여섯 필드는 명시하고 실제 null/값 응답을 모두 허용한다', () => {
  assert.ok(captured.openapi.openapi.startsWith('3.1.'));
  const schemas = captured.openapi.components.schemas;
  for (const name of ['actorUserId', 'diaryId', 'pageId', 'readAt']) assert.ok(allowsNull(schemas.NotificationData.properties[name]), name);
  assert.ok(allowsNull(schemas.NotificationListResponse.properties.nextCursor));
  assert.ok(allowsNull(schemas.Item.properties.invitation));
  for (const schema of [schemas.NotificationData.properties.notificationId, schemas.NotificationData.properties.createdAt,
    schemas.NotificationListResponse.properties.items, schemas.NotificationListResponse.properties.hasNext, schemas.InvitationTarget.properties.canOpen,
    schemas.InvitationTarget, schemas.Item.properties.notification, schemas.UnreadCount.properties.unreadCount]) assert.equal(allowsNull(schema), false);
  const responseSchema = (path, method) => Object.values(paths[path][method].responses['200'].content)[0].schema;
  for (const name of ['first', 'last', 'empty']) validateResponse(responseSchema('/api/v1/notifications', 'get'), captured.cases[name].body);
  validateResponse(responseSchema('/api/v1/notifications/unread-count', 'get'), captured.cases.count.body);
  validateResponse(responseSchema('/api/v1/notifications/{notificationId}', 'patch'), captured.cases.read.body);
  const notification = captured.cases.first.body.items[0].notification;
  for (const key of ['actorUserId', 'diaryId', 'pageId', 'readAt']) assert.equal(notification[key], null);
  assert.equal(captured.cases.last.body.items[0].invitation, null);
  assert.equal(captured.cases.last.body.nextCursor, null);
  assert.equal(typeof captured.cases.read.body.readAt, 'string');
  assert.throws(() => validateResponse({ type: 'string' }, null), /null 허용 명시 누락/);
  assert.throws(() => validateResponse(schemas.NotificationData.properties.notificationId, null), /null 허용 명시 누락/);
  assert.throws(() => validateResponse({ $ref: '#/components/schemas/InvitationTarget', type: ['object', 'null'] }, null), /null 허용 명시 누락/);
});

test('required는 nullable와 별개로 항상 포함되는 알림 필드를 명시한다', () => {
  const schemas = captured.openapi.components.schemas;
  for (const [name, required] of Object.entries({
    NotificationData: ['notificationId', 'notificationType', 'actorUserId', 'diaryId', 'pageId', 'readAt', 'createdAt'],
    NotificationListResponse: ['items', 'nextCursor', 'hasNext'], Item: ['notification', 'invitation'],
    InvitationTarget: ['inviteId', 'status', 'diaryId', 'canOpen'], UnreadCount: ['unreadCount'],
  })) assert.deepEqual([...schemas[name].required].sort(), required.sort(), name);
  const listSchema = { $ref: '#/components/schemas/NotificationListResponse' };
  for (const name of ['first', 'last', 'empty']) validateResponse(listSchema, captured.cases[name].body);
  const missingCursor = structuredClone(captured.cases.last.body); delete missingCursor.nextCursor;
  assert.throws(() => validateResponse(listSchema, missingCursor), /required 필드 누락/);
  const missingInvitation = structuredClone(captured.cases.last.body); delete missingInvitation.items[0].invitation;
  assert.throws(() => validateResponse(listSchema, missingInvitation), /required 필드 누락/);
  assert.throws(() => validateResponse({ $ref: '#/components/schemas/UnreadCount' }, {}), /required 필드 누락/);
});

test('문서화한 오류 상태·ProblemDetail 필수 필드·code enum은 실제 Spring 응답과 일치한다', async () => {
  const item = '/api/v1/notifications/{notificationId}';
  for (const [name, path, method] of [
    ['invalidLimit', '/api/v1/notifications', 'get'], ['invalidCursor', '/api/v1/notifications', 'get'], ['invalidType', '/api/v1/notifications', 'get'],
    ['unauthorized', '/api/v1/notifications', 'get'], ['unauthorizedCount', '/api/v1/notifications/unread-count', 'get'],
    ['unauthorizedRead', item, 'patch'], ['unauthorizedDelete', item, 'delete'],
    ['notFound', item, 'patch'], ['missingRead', item, 'patch'], ['deletedRead', item, 'patch'], ['notFoundDelete', item, 'delete'],
    ['invalidDeleteId', item, 'delete'], ['overflowReadId', item, 'patch'],
    ['invalidReadId', item, 'patch'], ['overflowDeleteId', item, 'delete'],
  ]) {
    const response = captured.cases[name];
    assert.ok(response.contentType.startsWith('application/problem+json'), name);
    const schema = paths[path][method].responses[String(response.status)].content['application/problem+json'].schema;
    validateResponse(schema, response.body);
    assert.equal(response.body.type, undefined); // Spring은 기본 about:blank를 생략한다.
    const missingDetail = { ...response.body }; delete missingDetail.detail;
    assert.throws(() => validateResponse(schema, missingDetail), /required 필드 누락/);
    const wrongStatus = { ...response.body, status: 500 };
    assert.throws(() => validateResponse(schema, wrongStatus), /enum 값 불일치/);
    if (response.body.code) assert.throws(() => validateResponse(schema, { ...response.body, code: 'UNEXPECTED_CODE' }), /enum 값 불일치/);
    if (response.status === 401) {
      const missingCode = { ...response.body }; delete missingCode.code;
      assert.throws(() => validateResponse(schema, missingCode), /required 필드 누락/);
    }
  }
  assert.equal(captured.cases.invalidType.body.code, undefined);
  assert.equal(captured.cases.invalidDeleteId.body.code, undefined);
  for (const name of ['notFound', 'missingRead', 'deletedRead', 'notFoundDelete']) assert.equal(captured.cases[name].body.code, 'NOTIFICATION_NOT_FOUND');
  assert.equal(captured.cases.invalidCursor.body.code, 'INVALID_NOTIFICATION_CURSOR');
  for (const name of ['unauthorized', 'unauthorizedCount', 'unauthorizedRead', 'unauthorizedDelete']) assert.equal(captured.cases[name].body.code, 'AUTHENTICATION_REQUIRED');
  for (const name of ['invalidCursor', 'unauthorizedCount', 'unauthorizedRead', 'unauthorizedDelete', 'notFoundDelete', 'invalidDeleteId']) {
    const api = apiFor(name);
    const call = name === 'unauthorizedCount' ? api.count() : name === 'unauthorizedRead' ? api.read('90003')
      : name.endsWith('Delete') || name === 'invalidDeleteId' ? api.remove('90005') : api.list();
    await assert.rejects(call, error => error.status === captured.cases[name].status && error.code === (captured.cases[name].body.code || 'HTTP_ERROR'));
  }
});
