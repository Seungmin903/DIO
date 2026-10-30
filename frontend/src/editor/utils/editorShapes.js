import { createId } from './common.js'
import { textStyle, textSettings } from './text.js'

export const SHAPE_CATEGORIES = [{ id: 'all', label: '전체' }, { id: 'basic', label: '기본' }, { id: 'polygons', label: '다각형' }, { id: 'stars', label: '별' }, { id: 'arrows', label: '화살표' }, { id: 'bubbles', label: '말풍선' }, { id: 'symbols', label: '기호' }]
const polygon = points => `M${points.map(p => p.join(' ')).join(' L')} Z`
const regular = (n, offset = -Math.PI / 2) => polygon(Array.from({ length: n }, (_, i) => [50 + 48 * Math.cos(offset + i * 2 * Math.PI / n), 50 + 48 * Math.sin(offset + i * 2 * Math.PI / n)]))
const star = polygon(Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 22 : 48, a = -Math.PI / 2 + i * Math.PI / 5; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)] }))
const rightArrow = [[0,30],[60,30],[60,0],[100,50],[60,100],[60,70],[0,70]]
const arrow = fn => polygon(rightArrow.map(([x,y]) => fn(x,y)))
export const EDITOR_SHAPES = [
  { id: 'rect', label: '사각형', category: 'basic', path: 'M0 0 H100 V100 H0 Z' },
  { id: 'round', label: '둥근 사각형', category: 'basic', path: 'M14 0 H86 Q100 0 100 14 V86 Q100 100 86 100 H14 Q0 100 0 86 V14 Q0 0 14 0 Z' },
  { id: 'circle', label: '원', category: 'basic', path: 'M0 50 A50 50 0 1 0 100 50 A50 50 0 1 0 0 50 Z' },
  { id: 'ellipse', label: '타원', category: 'basic', path: 'M0 50 A50 50 0 1 0 100 50 A50 50 0 1 0 0 50 Z', ratio: 1.6 },
  { id: 'triangle', label: '삼각형', category: 'basic', path: 'M50 0 L100 100 H0 Z' },
  { id: 'diamond', label: '마름모', category: 'basic', path: 'M50 0 L100 50 L50 100 L0 50 Z' },
  { id: 'star', label: '별', category: 'symbols', path: star },
  { id: 'heart', label: '하트', category: 'symbols', path: 'M50 96 C35 80 0 55 0 28 C0 -5 38 -8 50 20 C62 -8 100 -5 100 28 C100 55 65 80 50 96 Z' },
  { id: 'pentagon', label: '오각형', category: 'basic', path: regular(5) },
  { id: 'hexagon', label: '육각형', category: 'basic', path: regular(6, 0) },
  { id: 'speech', label: '말풍선', category: 'symbols', path: 'M0 0 H100 V75 H45 L20 100 V75 H0 Z' },
  { id: 'note', label: '접힌 메모', category: 'symbols', path: 'M0 0 H100 V70 L70 100 H0 Z M70 100 V70 H100' },
  { id: 'arrowRight', label: '오른쪽 화살표', category: 'arrows', path: arrow((x,y) => [x,y]), ratio: 1.4 },
  { id: 'arrowLeft', label: '왼쪽 화살표', category: 'arrows', path: arrow((x,y) => [100-x,y]), ratio: 1.4 },
  { id: 'arrowUp', label: '위쪽 화살표', category: 'arrows', path: arrow((x,y) => [y,100-x]) },
  { id: 'arrowDown', label: '아래쪽 화살표', category: 'arrows', path: arrow((x,y) => [y,x]) },
  { id: 'doubleArrow', label: '양방향 화살표', category: 'arrows', path: polygon([[0,50],[25,0],[25,30],[75,30],[75,0],[100,50],[75,100],[75,70],[25,70],[25,100]]), ratio: 1.4 },
  { id: 'elbowArrow', label: '꺾인 화살표', category: 'arrows', path: 'M0 100 V25 H60 V0 L100 40 L60 80 V55 H30 V100 Z' },
  { id: 'plus', label: '십자', category: 'symbols', path: 'M33 0 H67 V33 H100 V67 H67 V100 H33 V67 H0 V33 H33 Z' },
  { id: 'cloud', label: '구름', category: 'symbols', path: 'M18 85 C0 85 0 52 12 48 C4 25 26 8 42 22 C52 0 90 8 88 36 C100 40 100 85 82 85 Z', ratio: 1.5 },
  { id: 'flag', label: '깃발', category: 'symbols', path: 'M10 100 V0 H100 L72 25 L100 50 H10 Z' },
  { id: 'pill', label: '캡슐', category: 'basic', path: 'M30 0 H70 C110 0 110 100 70 100 H30 C-10 100 -10 0 30 0 Z', ratio: 1.6 },
]
// 종류마다 실제 경로를 저장한다. 사진 자르기 경로와 분리해 기존 프레임의 모양은 바꾸지 않는다.
const add = (id,label,category,path,ratio=1) => EDITOR_SHAPES.push({id,label,category,path,ratio})
for (const [n,label] of [[3,'정삼각형'],[7,'칠각형'],[8,'팔각형'],[9,'구각형'],[10,'십각형'],[12,'십이각형']]) add(`polygon${n}`,label,'polygons',regular(n))
for (const item of EDITOR_SHAPES) {
  if (['triangle','pentagon','hexagon'].includes(item.id)) item.category='polygons'
  if (item.id==='star') item.category='stars'
  if (['speech','note'].includes(item.id)) item.category='bubbles'
}
const starN = (n,inner=23) => polygon(Array.from({length:n*2},(_,i)=>{const r=i%2?inner:48,a=-Math.PI/2+i*Math.PI/n;return [50+r*Math.cos(a),50+r*Math.sin(a)]}))
for(const n of [4,6,7,8,10,12,16]) add(`star${n}`,`${n}각 별`,'stars',starN(n,n>=10?34:23))
add('sparkle','반짝임','stars',starN(4,12))
add('sun','해','stars',starN(16,40))
for(const [id,label,path,ratio] of [
 ['rectangleWide','직사각형','M0 0H100V100H0Z',1.6],
 ['triangleDown','역삼각형','M0 0H100L50 100Z'],
 ['triangleRight','직각삼각형','M0 0L100 100H0Z'],
 ['trapezoid','사다리꼴','M22 0H78L100 100H0Z'],
 ['parallelogram','평행사변형','M25 0H100L75 100H0Z'],
 ['semicircle','반원','M0 100A50 100 0 0 1 100 100Z',1.6],
 ['quarterCircle','사분원','M0 0A100 100 0 0 1 100 100H0Z'],
 ['teardrop','물방울','M50 0C45 25 0 50 0 70A50 30 0 0 0 100 70C100 50 55 25 50 0Z'],
 ['arch','아치','M0 100V50A50 50 0 0 1 100 50V100Z'],
 ['chevron','갈매기형','M0 0H60L100 50L60 100H0L40 50Z'],
]) add(id,label,'basic',path,ratio)
for(const [id,label,path,ratio] of [
 ['arrowDiagonalUp','오른쪽 위 화살표','M0 70L50 20H25V0H100V75H80V50L30 100Z'],
 ['arrowDiagonalDown','오른쪽 아래 화살표','M0 30L30 0L80 50V25H100V100H25V80H50Z'],
 ['doubleArrowVertical','위아래 화살표','M50 0L100 25H70V75H100L50 100L0 75H30V25H0Z'],
 ['fourArrow','사방 화살표','M50 0L70 20H60V40H80V30L100 50L80 70V60H60V80H70L50 100L30 80H40V60H20V70L0 50L20 30V40H40V20H30Z'],
 ['arrowNotched','꼬리 화살표','M0 20H60V0L100 50L60 100V80H0L20 50Z',1.4],
 ['arrowRibbon','리본 화살표','M0 0H70L100 50L70 100H0L20 50Z',1.5],
 ['turnArrow','회전 화살표','M10 100V40Q10 10 40 10H65V0L100 30L65 60V45H40Q35 45 35 50V100Z'],
 ['uturnArrow','되돌이 화살표','M0 100V45A35 35 0 0 1 70 45V65H100L55 100L20 65H45V45A10 10 0 0 0 25 45V100Z'],
]) add(id,label,'arrows',path,ratio)
for(const [id,label,path,ratio] of [
 ['roundSpeech','둥근 말풍선','M15 0H85Q100 0 100 15V60Q100 75 85 75H45L20 100V75H15Q0 75 0 60V15Q0 0 15 0Z',1.3],
 ['speechRight','오른쪽 말풍선','M0 0H100V75H80V100L55 75H0Z',1.3],
 ['speechOval','타원 말풍선','M25 85C0 75 0 15 25 5C75 0 100 15 100 50C95 75 70 85 45 85L20 100Z',1.3],
 ['thought','생각 말풍선','M20 80C0 80 0 45 12 40C5 15 28 0 45 15C65 0 100 10 92 35C100 55 95 85 70 80C50 95 30 90 20 80Z M16 88A5 5 0 1 0 26 88A5 5 0 1 0 16 88Z M7 97A3 3 0 1 0 13 97A3 3 0 1 0 7 97Z',1.3],
 ['banner','배너','M0 0H100V100L50 75L0 100Z'],
 ['ticket','티켓','M0 0H100V30A20 20 0 0 0 100 70V100H0V70A20 20 0 0 0 0 30Z',1.5],
]) add(id,label,'bubbles',path,ratio)
for(const [id,label,path,ratio] of [
 ['cross','엑스','M0 20L20 0L50 30L80 0L100 20L70 50L100 80L80 100L50 70L20 100L0 80L30 50Z'],
 ['check','체크','M0 50L20 30L40 55L82 0L100 18L42 100Z'],
 ['lightning','번개','M55 0H95L60 40H90L20 100L40 55H5Z'],
 ['moon','초승달','M80 0A50 50 0 1 0 80 100A42 50 0 0 1 80 0Z'],
 ['shield','방패','M0 0H100V45Q100 80 50 100Q0 80 0 45Z'],
 ['bookmark','책갈피','M0 0H100V100L50 65L0 100Z'],
 ['home','집','M0 40L50 0L100 40H85V100H60V65H40V100H15V40Z'],
 ['envelope','봉투','M0 0H100V100H0Z M0 0L50 55L100 0',1.4],
 ['diamondGem','보석','M20 0H80L100 30L50 100L0 30Z M0 30H100M20 0L35 30L50 100L65 30L80 0',1.2],
 ['crown','왕관','M0 10L30 40L50 0L70 40L100 10L85 100H15Z',1.3],
 ['clover','네잎클로버','M50 30C20 -20 -20 20 30 50C-20 80 20 120 50 70C80 120 120 80 70 50C120 20 80 -20 50 30Z'],
 ['flower','꽃','M50 22C15 -15 -10 20 22 50C-10 80 15 115 50 78C85 115 110 80 78 50C110 20 85 -15 50 22Z'],
 ['puzzle','퍼즐','M0 0H30C20 30 80 30 70 0H100V30C70 20 70 80 100 70V100H70C80 70 20 70 30 100H0V70C30 80 30 20 0 30Z'],
]) add(id,label,'symbols',path,ratio)

export const SHAPE_BORDER_STYLES = [
  {id:'solid',label:'실선'},
  {id:'dotted',label:'점선',dash:[1,2]},
  {id:'shortDashed',label:'짧은 파선',dash:[2,2]},
  {id:'dashed',label:'파선',dash:[4,3]},
  {id:'longDashed',label:'긴 파선',dash:[8,3]},
  {id:'dashDot',label:'일점쇄선',dash:[6,2,1,2]},
  {id:'dashDotDot',label:'이점쇄선',dash:[6,2,1,2,1,2]},
]
export const shapeBorderDash = (id,width) => SHAPE_BORDER_STYLES.find(item=>item.id===id)?.dash?.map(unit=>unit*width)

export const DEFAULT_SHAPE_STYLE = { shape: 'round', fill: '#F8EBA7', borderColor: '#9D9866', borderWidth: 0, borderStyle: 'solid', color: '#0B1766', font: 'sans', fontSize: 20, bold: false, align: 'center', verticalAlign: 'middle' }
export const shapeDefinition = id => EDITOR_SHAPES.find(item => item.id === id) ?? EDITOR_SHAPES[1]
export function createShape(settings, center) {
  const value = { ...DEFAULT_SHAPE_STYLE, ...settings }, ratio = shapeDefinition(value.shape).ratio ?? 1
  const w = 220, h = 220 / ratio
  return { ...value, id: createId(), type: 'shape', text: '', x: center.x-w/2, y: center.y-h/2, w, h, rotation: 0 }
}
export function shapeTextStyle(object, zoom = 1, platform = 'web') {
  return { ...textStyle({...DEFAULT_SHAPE_STYLE,...object,textAlign:object.textAlign ?? object.align ?? 'left'},zoom,platform),padding:14*zoom }
}

export const shapeTextSettings = object => ({...textSettings({...object,textAlign:object.textAlign ?? object.align ?? 'left'}),verticalAlign:object.verticalAlign ?? 'middle'})
export const shapeTextFormatPatch = (object,patch) => {
  const next={...shapeTextSettings(object),...patch}
  return {...next,align:next.textAlign,...('color' in patch && {colorRanges:[]})}
}

// 도형 전체 사각 영역을 정렬 기준으로 사용한다. 긴 글은 크기를 바꾸지 않고 넘쳐 표시한다.
export function shapeTextBox(object,zoom=1) {
 const pad=Math.min(14+(object.borderWidth??0)/2,object.w/4,object.h/4)
 return {left:pad*zoom,top:pad*zoom,width:Math.max(1,object.w-2*pad)*zoom,height:Math.max(1,object.h-2*pad)*zoom}
}
