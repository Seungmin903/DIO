import assert from 'node:assert/strict';
import test from 'node:test';
import { colors } from '../src/shared/theme.js';
import { C, FALLBACK_COVER_COLOR } from '../src/diary/constants.js';
import { toDiary } from '../src/diary/services/diaryApi.js';

const rgb = hex => hex.slice(1).match(/../g).map(value => parseInt(value,16));
const luminance = values => values.map(value => {
  const v=value/255;
  return v<=0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4;
}).reduce((total,value,i)=>total+value*[0.2126,0.7152,0.0722][i],0);
const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+0.05)/(Math.min(luminance(a),luminance(b))+0.05);

test('흰 글자 CTA는 일반 크기 글자 대비 4.5:1을 충족한다', () => {
  assert.ok(contrast(rgb(colors.surface),rgb(colors.primaryStrong))>=4.5);
  assert.equal(C.blueStrong, colors.primaryStrong);
  assert.notEqual(colors.primary, colors.primaryStrong);
});

test('중립 앱 배경과 파란 선택 배경을 분리하고 선택 글자 대비를 유지한다', () => {
  assert.notEqual(C.active,C.canvas);
  const [r,g,b,a]=colors.primarySoft.match(/[\d.]+/g).map(Number);
  const selected=[r,g,b].map(value=>value*a+255*(1-a));
  assert.ok(contrast(rgb(colors.text),selected)>=4.5);
  assert.ok(contrast(rgb(colors.text),rgb(C.canvas))>=4.5);
});

test('표지 기본색은 앱 배경과 독립적이며 서버에 저장된 표지색은 보존한다', () => {
  const row = { diaryId: 'cover-test', diaryTitle: '표지 검증' };
  assert.equal(FALLBACK_COVER_COLOR, '#CED9EE');
  assert.notEqual(FALLBACK_COVER_COLOR, colors.surfaceSoft);
  assert.equal(toDiary(row).color, FALLBACK_COVER_COLOR);
  assert.equal(toDiary({ ...row, coverColor: '#123456' }).color, '#123456');
});
