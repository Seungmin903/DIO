// node qa/generate-media-fixtures.mjs <output-dir>
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { GifWriter } from 'omggif'
import UPNG from 'upng-js'

const output=process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('./.out/fixtures/', import.meta.url))
await mkdir(output,{recursive:true})
const manifest=[]
async function save(name,bytes,width,height,frames=1) {
  await writeFile(path.join(output,name),bytes)
  manifest.push({name,width,height,frames,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})
}
for(const [name,width,height] of [['photo-quadrants.png',2048,1536],['photo-large.png',4096,3072]]) {
  const pixels=new Uint8Array(width*height*4)
  const colors=[[224,48,48],[32,176,80],[40,88,224],[240,192,40]]
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const color=colors[(y>=height/2?2:0)+(x>=width/2?1:0)],i=(y*width+x)*4
    pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];pixels[i+3]=255
  }
  await save(name,new Uint8Array(UPNG.encode([pixels.buffer],width,height,0)),width,height)
}
for(const [name,color] of [['first-red.gif',0xff0000],['first-green.gif',0x00ff00]]) {
  const buffer=new Uint8Array(65536),writer=new GifWriter(buffer,128,128,{palette:[color,0x0000ff],loop:0})
  writer.addFrame(0,0,128,128,new Uint8Array(128*128),{delay:5})
  writer.addFrame(0,0,128,128,new Uint8Array(128*128).fill(1),{delay:5})
  await save(name,buffer.slice(0,writer.end()),128,128,2)
}
await save('corrupt.png',new Uint8Array([137,80,78,71,13,10,26,10]),0,0)
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify({output,manifest}))
