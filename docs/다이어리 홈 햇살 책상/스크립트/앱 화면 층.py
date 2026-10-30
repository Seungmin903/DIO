# 앱 화면 찍기.cjs 가 찍은 ui-black.png · ui-white.png (현재 폴더)의 차이로 투명도를 구해 ui.png 를 만든다. ui_check.jpg 는 확인용.
import numpy as np
from PIL import Image
b=np.asarray(Image.open('ui-black.png').convert('RGB')).astype(np.float32)
w=np.asarray(Image.open('ui-white.png').convert('RGB')).astype(np.float32)
a=np.clip(1-((w-b).mean(axis=2))/255,0,1)
c=np.where(a[...,None]>0.003, b/np.maximum(a[...,None],1e-3), 0)
Image.fromarray(np.dstack([np.clip(c,0,255), a*255]).astype(np.uint8)).save('ui.png')
print('transparent frac', (a<0.01).mean())
ui=Image.open('ui.png'); bg=Image.new('RGBA',ui.size,(214,190,160,255)); bg.alpha_composite(ui); bg.convert('RGB').resize((1280,800)).save('ui_check.jpg')
