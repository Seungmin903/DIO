"""Lossless full-font storage experiment. Does not alter the source font or app."""
import argparse
import gzip
import hashlib
import json
import logging
import shutil
from pathlib import Path
import time

from fontTools.ttLib import TTFont
from PIL import Image, ImageFont

logging.getLogger('fontTools.ttLib.tables._h_e_a_d').setLevel(logging.ERROR)

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def load(path):return TTFont(path,recalcTimestamp=False,recalcBBoxes=False)

def outline_equal(original,candidate):
    a,b=load(original),load(candidate)
    assert a.getBestCmap()==b.getBestCmap()
    assert a.getGlyphOrder()==b.getGlyphOrder()
    assert a['hmtx'].metrics==b['hmtx'].metrics
    assert a['head'].unitsPerEm==b['head'].unitsPerEm
    for tag in ['OS/2','post','name','cmap']:
        assert a.getTableData(tag)==b.getTableData(tag),(candidate.name,tag)
    for key,value in a['hhea'].__dict__.items():
        if key!='numberOfHMetrics':assert value==b['hhea'].__dict__[key],key
    points=0;contours=0
    for name in a.getGlyphOrder():
        ga,gb=a['glyf'][name],b['glyf'][name]
        assert ga.numberOfContours==gb.numberOfContours
        if ga.numberOfContours:
            ca,ea,fa=ga.getCoordinates(a['glyf']);cb,eb,fb=gb.getCoordinates(b['glyf'])
            assert list(ca)==list(cb) and ea==eb and [f&1 for f in fa]==[f&1 for f in fb],name
            points+=len(ca);contours+=ga.numberOfContours
    a.close();b.close()
    return dict(allCoordinatesAndOnCurveFlagsIdentical=True,metricsAndLayoutTablesIdentical=True,points=points,contours=contours)

def render_equal(original,candidate,sizes):
    results=[]
    for size in sizes:
        a,b=ImageFont.truetype(str(original),size),ImageFont.truetype(str(candidate),size)
        changed=0;max_delta=0;samples=[]
        for code in range(0xac00,0xd7a4):
            ma,oa=a.getmask2(chr(code),mode='L',anchor='ls');mb,ob=b.getmask2(chr(code),mode='L',anchor='ls')
            ba=Image.Image()._new(ma).tobytes();bb=Image.Image()._new(mb).tobytes()
            if ma.size!=mb.size or oa!=ob or ba!=bb:
                changed+=1
                if len(samples)<12:samples.append(chr(code))
                if ma.size==mb.size and oa==ob:max_delta=max(max_delta,max((abs(x-y) for x,y in zip(ba,bb)),default=0))
                else:max_delta=255
        results.append(dict(sizePx=size,compared=11172,changedGlyphs=changed,max8bitDifference=max_delta,samples=samples))
        print(candidate.name,size,changed,flush=True)
    return results

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--reuse-from',type=Path);args=p.parse_args()
    if args.output.exists() and any(args.output.iterdir()):raise ValueError('Use an empty experiment directory')
    args.output.mkdir(parents=True,exist_ok=True);before=sha(args.source);started=time.time()
    results=[]
    if args.reuse_from:
        for name in ['coordinate-packed.ttf','lossless.woff2']:
            shutil.copyfile(args.reuse_from/name,args.output/name)
    compact=args.output/'coordinate-packed.ttf'
    if not compact.exists():
        font=load(args.source)
        for name in font.getGlyphOrder():font['glyf'][name].expand(font['glyf'])
        font.save(compact);font.close()
    geometry=outline_equal(args.source,compact)
    results.append(dict(method='TTF coordinate encoding only',file=compact.name,bytes=compact.stat().st_size,sha256=sha(compact),geometry=geometry,raster=render_equal(args.source,compact,[24,48,128,256])))
    stored=args.output/'coordinate-packed.ttf.gz';stored.write_bytes(gzip.compress(compact.read_bytes(),compresslevel=9,mtime=0))
    assert gzip.decompress(stored.read_bytes())==compact.read_bytes()
    results.append(dict(method='Gzip storage; decompress before font load',file=stored.name,bytes=stored.stat().st_size,sha256=sha(stored),byteExactRestoration=True,raster=results[0]['raster'],nativeDirectLoadVerified=False))
    # Exact decompression is validated as outlines and metrics, not TTF file bytes.
    web=args.output/'lossless.woff2'
    if not web.exists():
        font=load(compact);font.flavor='woff2';font.save(web);font.close()
    restored=args.output/'woff2-restored.ttf';font=load(web);font.flavor=None;font.save(restored);font.close()
    results.append(dict(method='WOFF2 container',file=web.name,bytes=web.stat().st_size,sha256=sha(web),geometry=outline_equal(args.source,restored),raster=render_equal(args.source,restored,[24,48,128,256]),nativeDirectLoadVerified=False))
    for value in results:
        value['reductionPercent']=100*(1-value['bytes']/args.source.stat().st_size)
        value['allTestedRastersIdentical']=all(r['changedGlyphs']==0 for r in value['raster'])
    assert before==sha(args.source),'Source font changed'
    report=dict(sourceFile=args.source.name,sourceBytes=args.source.stat().st_size,sourceSha256=before,hangulCharacters=11172,sourceUnchanged=True,seconds=time.time()-started,results=results)
    (args.output/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps([dict(method=v['method'],bytes=v['bytes'],reductionPercent=v['reductionPercent'],identical=v['allTestedRastersIdentical']) for v in results]),flush=True)

if __name__=='__main__':main()
