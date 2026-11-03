// Keep only the live tail mutable. SVG never reparses a growing 5,000-point path.
export const PREVIEW_SEGMENTS = 48
const xy = p => `${Math.round(p.x*100)/100},${Math.round(p.y*100)/100}`
export function createInkPreview(point){return {parts:[],tail:`M${xy(point)}`,segments:0,last:point}}
export function appendInkPreview(ink,point){
  if(ink.segments===PREVIEW_SEGMENTS){ink.parts.push(ink.tail);ink.tail=`M${xy(ink.last)}`;ink.segments=0}
  ink.tail+=` L${xy(point)}`;ink.segments++;ink.last=point
}
export const inkPreview = ink => ({parts:ink.parts.slice(),tail:ink.tail})
