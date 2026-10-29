"""Actual FP32 ONNX -> the same Java outline writer -> TTF verification.

This is desktop validation, never an Android latency or handwriting-quality score.
Run using an environment with numpy/Pillow/onnxruntime/torch/fontTools/scipy.
"""
import sys
sys.dont_write_bytecode = True
sys.stdout.reconfigure(encoding='utf-8')
import argparse, hashlib, json, subprocess, time
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import onnxruntime as ort
from fontTools.ttLib import TTFont
from scipy import ndimage as ndi

def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

def main():
    p=argparse.ArgumentParser(); p.add_argument('--snapshot',required=True); p.add_argument('--models',required=True); p.add_argument('--output',required=True); p.add_argument('--original-root'); p.add_argument('--full',action='store_true'); args=p.parse_args()
    root=Path(__file__).resolve().parents[1]; output=Path(args.output).resolve(); output.mkdir(parents=True,exist_ok=True)
    data=json.loads(Path(args.snapshot).read_text(encoding='utf-8')); models=Path(args.models)
    manifest=json.loads((models/'manifest.json').read_text(encoding='utf-8')) if (models/'manifest.json').exists() else {}
    model_hashes={name:hashlib.sha256((models/name).read_bytes()).hexdigest() for name in ('encoder.fp32.onnx','decoder.fp32.onnx')}
    previous=json.loads((output/'validation.json').read_text(encoding='utf-8')) if (output/'validation.json').exists() else None
    if any(output.glob('*.gray')) and (not previous or previous.get('input_hash') != data['inputHash']):
        raise ValueError('Existing rasters belong to an unknown/different input. Use a new output directory.')
    if previous and previous.get('model_hashes') and previous['model_hashes'] != model_hashes:
        raise ValueError('Existing rasters belong to different ONNX models. Use a new output directory.')
    so=ort.SessionOptions();so.intra_op_num_threads=4;so.inter_op_num_threads=1
    encoder=ort.InferenceSession(str(models/'encoder.fp32.onnx'),sess_options=so,providers=['CPUExecutionProvider'])
    decoder=ort.InferenceSession(str(models/'decoder.fp32.onnx'),sess_options=so,providers=['CPUExecutionProvider'])
    main=np.zeros((68,256,16,16),np.float32);skip=np.zeros((68,128,32,32),np.float32);counts=np.zeros(68,np.int32)
    def addresses(c):
        n=ord(c)-0xac00;return np.array([[n//588,19+n//28%21,40+n%28]],np.int64)
    for row in data['inputs']:
        inp=(np.array(row['pixels'],np.float32).reshape(1,1,128,128)/127.5-1)
        f,s=encoder.run(None,{'image':inp})
        for role,a in enumerate(addresses(row['character'])[0]):main[a]+=f[0,role];skip[a]+=s[0,role];counts[a]+=1
    assert (counts>0).all()
    main/=counts[:,None,None,None];skip/=counts[:,None,None,None]
    def generate(c):
        a=addresses(c)
        return decoder.run(None,dict(components=main[a],skips=skip[a],component_addresses=a))[0][0,0]
    chars=list(dict.fromkeys('안녕하세요감사합니다반갑습니다좋은하루되세요오늘도수고했어요잘부탁드립니다사랑합니다나만의손글씨우리함께힘내요다음에또만나요'))
    if args.full:chars=[chr(i) for i in range(0xac00,0xd7a4)]
    report=dict(platform='Windows desktop CPU',phone_tested=False,references=36,precision='fp32',source_checkpoint_sha256='e5b28ca6793429b5e8bc77ed07ef166c7dfce91e089f068cc86318897700cae0',input_hash=data['inputHash'],generated=0,total=len(chars),conversion_comparison=[])
    report.update(model_version=manifest.get('model_version',data.get('modelVersion')),model_hashes=model_hashes)
    if args.original_root:
        import torch
        from sconf import Config
        original=Path(args.original_root);sys.path.insert(0,str(original/'vendor/dmfont'))
        from models import MACore
        torch.set_num_threads(4)
        cfg=Config(str(original/'vendor/dmfont/cfgs/kor.yaml'))
        g=MACore(1,cfg['C'],1,**cfg['g_args'],n_comps=68,n_comp_types=3,language='kor').eval().requires_grad_(False)
        g.load_state_dict(torch.load(original/'models/korean-handwriting.pth',map_location='cpu',weights_only=True)['generator_ema'],strict=True)
        report['feature_comparison']=[]
        with torch.no_grad():
            for row in data['inputs']:
                inp=torch.from_numpy(np.array(row['pixels'],np.float32).reshape(1,1,128,128)/127.5-1)
                ids=addresses(row['character']).copy();ids[:,1]-=19;ids[:,2]-=40
                g.encode_write(torch.zeros(1,dtype=torch.long),torch.from_numpy(ids),inp,reset_dynamic_memory=False)
                feats=g.component_encoder(inp); expected_main=feats[-1].numpy();expected_skip=g.component_encoder.filter_skips(feats)[0].numpy()
                actual_main,actual_skip=encoder.run(None,{'image':inp.numpy()})
                item=dict(character=row['character'],main_max=float(np.abs(actual_main-expected_main).max()),skip_max=float(np.abs(actual_skip-expected_skip).max()),main_reference_abs_max=float(np.abs(expected_main).max()),skip_reference_abs_max=float(np.abs(expected_skip).max()),main_relative_l2=float(np.linalg.norm((actual_main-expected_main).astype(np.float64))/max(np.linalg.norm(expected_main.astype(np.float64)),1e-12)),skip_relative_l2=float(np.linalg.norm((actual_skip-expected_skip).astype(np.float64))/max(np.linalg.norm(expected_skip.astype(np.float64)),1e-12)))
                # Relative-position algebra changes FP32 association. Compare
                # error to feature energy, then check decoded pixels below.
                assert item['main_relative_l2']<1e-4 and item['skip_relative_l2']<1e-4,item
                report['feature_comparison'].append(item)
            for c in list('한이민글핀틔퀭좋루도또우'):
                ids=addresses(c).copy();ids[:,1]-=19;ids[:,2]-=40
                expected=g.read_decode(torch.zeros(1,dtype=torch.long),torch.from_numpy(ids)).numpy()[0,0]
                actual=generate(c)
                a=np.rint((actual.clip(-1,1)+1)*127.5).astype(np.uint8);b=np.rint((expected.clip(-1,1)+1)*127.5).astype(np.uint8)
                item=dict(character=c,png_pixel_max=int(abs(a.astype(int)-b.astype(int)).max()),png_pixel_mean=float(abs(a.astype(int)-b.astype(int)).mean()))
                assert item['png_pixel_max']<=2 and item['png_pixel_mean']<.05,item
                report['conversion_comparison'].append(item)
        del g
    began=time.perf_counter(); newly_generated=0
    for i,c in enumerate(chars):
        path=output/f'{ord(c)}.gray'
        if not path.exists():
            pixels=np.rint((generate(c).clip(-1,1)+1)*127.5).astype(np.uint8)
            assert (pixels<200).sum()>=8,c
            path.write_bytes(pixels.tobytes())
            newly_generated+=1
        report['generated']=i+1
        if (i+1)%256==0 or i+1==len(chars):
            report['newly_generated']=newly_generated; report['cached_rasters']=i+1-newly_generated
            if newly_generated: report['generation_seconds']=time.perf_counter()-began
            elif previous and 'generation_seconds' in previous: report['generation_seconds']=previous['generation_seconds']
            report['raster_pass_seconds']=time.perf_counter()-began
            write(output/'validation.json',report);print(json.dumps(dict(generated=i+1,total=len(chars),newly_generated=newly_generated,pass_seconds=report['raster_pass_seconds'])),flush=True)
    classes=output/'classes';classes.mkdir(exist_ok=True)
    source=root/'modules/dio-handwriting/android/src/main/java/expo/modules/diohandwriting/OutlineFont.java'
    subprocess.run(['javac','-d',str(classes),str(source)],check=True)
    fontpath=output/'generated.ttf'
    if not fontpath.exists():subprocess.run(['java','-cp',str(classes),'expo.modules.diohandwriting.OutlineFont',str(output),'rasters'],check=True)
    font=TTFont(fontpath,checkChecksums=2);mapping=font.getBestCmap()
    assert all(ord(c) in mapping for c in chars)
    for c in chars:assert font['glyf'][mapping[ord(c)]].numberOfContours>0
    max_points=max(font['glyf'][mapping[ord(c)]].endPtsOfContours[-1]+1 for c in chars)
    max_contours=max(font['glyf'][mapping[ord(c)]].numberOfContours for c in chars)
    assert font['maxp'].maxPoints==max_points and font['maxp'].maxContours==max_contours
    ft=ImageFont.truetype(str(fontpath),128);checks=[]
    for c in chars[::max(1,len(chars)//60)]:
        raw=np.frombuffer((output/f'{ord(c)}.gray').read_bytes(),dtype=np.uint8).reshape(128,128)
        im=Image.new('L',(128,128),255);ImageDraw.Draw(im).text((0,107.5),c,font=ft,fill=0,anchor='ls')
        render=np.asarray(im);m1=raw<200;m2=render<200
        def f1(a,b):
            recall=(ndi.distance_transform_edt(~b)[a]<=2).mean();precision=(ndi.distance_transform_edt(~a)[b]<=2).mean()
            return float(2*recall*precision/(recall+precision+1e-12))
        score=f1(m1,m2);assert score>=.98,(c,score)
        checks.append(dict(character=c,outline_ink_f1_radius2=score,source_components=int(ndi.label(m1,np.ones((3,3)))[1]),ttf_components=int(ndi.label(m2,np.ones((3,3)))[1])))
    report.update(status='complete',font_bytes=fontpath.stat().st_size,font_sha256=hashlib.sha256(fontpath.read_bytes()).hexdigest(),mapped_hangul=len(chars),outline_comparisons=checks,full_hangul_generated=args.full,actual_handwriting_GT_metrics=False)
    write(output/'validation.json',report);print(json.dumps({k:v for k,v in report.items() if k not in ['conversion_comparison','outline_comparisons','feature_comparison']}),flush=True)

if __name__=='__main__':main()
