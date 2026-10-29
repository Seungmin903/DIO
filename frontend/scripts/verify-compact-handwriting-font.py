"""Exercise the production Java writer against a complete, unchanged local TTF."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
from fontTools.ttLib import TTFont

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('measure',ROOT/'scripts/measure-font-compression.py')
measure=importlib.util.module_from_spec(spec);spec.loader.exec_module(measure)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
    if args.output.exists() and any(args.output.iterdir()):raise ValueError('Use an empty verification directory')
    out=args.output.resolve();out.mkdir(parents=True);classes=out/'classes';classes.mkdir();cache=out/'checkpoints';cache.mkdir()
    before=measure.sha(args.source);font=TTFont(args.source,recalcTimestamp=False,recalcBBoxes=False)
    cmap=font.getBestCmap();assert all(code in cmap for code in range(0xac00,0xd7a4))
    raw=args.source.read_bytes();start=font.reader.tables['glyf'].offset;loca=font['loca'].locations;order=font.getReverseGlyphMap()
    for code in range(0xac00,0xd7a4):
        gid=order[cmap[code]];(cache/f'{code}.gly').write_bytes(raw[start+loca[gid]:start+loca[gid+1]])
    source=ROOT/'modules/dio-handwriting/android/src/main/java/expo/modules/diohandwriting/OutlineFont.java'
    subprocess.run(['javac','-d',str(classes),str(source)],check=True)
    def build(folder):
        subprocess.run(['java','-cp',str(classes),'expo.modules.diohandwriting.OutlineFont',str(folder),'glyphs',str(cache),font['name'].getDebugName(1),font['name'].getDebugName(4)],check=True)
        return folder/'generated.ttf'
    result=build(out/'from-legacy');geometry=measure.outline_equal(args.source,result)
    # Half old and half compact checkpoints simulate a job paused before the update.
    packed=TTFont(result,recalcTimestamp=False,recalcBBoxes=False);data=result.read_bytes();at=packed.reader.tables['glyf'].offset;offsets=packed['loca'].locations;ids=packed.getReverseGlyphMap()
    for code in range(0xac01,0xd7a4,2):
        gid=ids[packed.getBestCmap()[code]];(cache/f'{code}.gly').write_bytes(data[at+offsets[gid]:at+offsets[gid+1]])
    resumed=build(out/'from-mixed');assert result.read_bytes()==resumed.read_bytes(),'Mixed checkpoints changed the font'
    # A completed file must never be replaced, including its bytes or ID metadata.
    retry=subprocess.run(['java','-cp',str(classes),'expo.modules.diohandwriting.OutlineFont',str(out/'from-legacy'),'glyphs',str(cache),'different-id','different-name'],capture_output=True)
    assert retry.returncode!=0 and measure.sha(result)==measure.sha(resumed),'Completed font was overwritten'
    raster=measure.render_equal(args.source,result,[24,48,128,256]);assert all(v['changedGlyphs']==0 for v in raster)
    assert before==measure.sha(args.source),'Original font changed'
    assert len(data)%4==0 and sum(int.from_bytes(data[i:i+4],'big') for i in range(0,len(data),4))&0xffffffff==0xb1b0afba
    report=dict(status='passed',sourceSha256=before,sourceUnchanged=True,bytes=result.stat().st_size,sha256=measure.sha(result),reductionPercent=100*(1-result.stat().st_size/args.source.stat().st_size),syllables=11172,geometry=geometry,raster=raster,mixedCheckpointResultByteExact=True,completedFontOverwriteRejected=True,productionWriter=str(source.relative_to(ROOT)))
    (out/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False),flush=True)

if __name__=='__main__':main()
