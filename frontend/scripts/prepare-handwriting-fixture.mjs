// Development verification only. Personal references stay in the ignored output folder.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { PROMPTS, MODEL_VERSION, PREPROCESS_VERSION, prepareSample } from '../src/handwriting/protocol.js'
const [profileFolder, outputFolder] = process.argv.slice(2)
if (!profileFolder || !outputFolder) throw new Error('Usage: node scripts/prepare-handwriting-fixture.mjs PROFILE_FOLDER OUTPUT_FOLDER')
const profile = JSON.parse(readFileSync(path.join(profileFolder, 'profile.json'))), samples = {}, inputs = []
for (const character of PROMPTS) {
  const id = profile.samples[character]
  if (!id) throw new Error(`Missing reference ${character}`)
  const original = JSON.parse(readFileSync(path.join(profileFolder, 'originals', `${id}.json`)))
  if (!original.strokes?.length) throw new Error(`No original strokes for ${character}`)
  const sample = { coordinateSize: 1024, strokes: original.strokes.map(stroke => {
    const s = 1024 / (stroke.coordinateSize ?? 512)
    return { width: stroke.width * s, points: stroke.points.map(p => ({ x: p.x * s, y: p.y * s, pressure: p.pressure ?? null, time: p.time ?? 0 })) }
  }) }
  samples[character] = sample
  const prepared = prepareSample(sample)
  inputs.push({ character, pixels: Array.from(prepared.pixels), metadata: prepared.metadata })
}
const draft = { schema: 1, kind: 'dio-handwriting-draft', id: 'development-fixture', samples, updatedAt: '2026-10-26T00:00:00.000Z' }
const body = { modelVersion: MODEL_VERSION, preprocessVersion: PREPROCESS_VERSION, draft, inputs }
const inputHash = createHash('sha256').update(JSON.stringify(body)).digest('hex')
mkdirSync(outputFolder, { recursive: true })
writeFileSync(path.join(outputFolder, 'snapshot.json'), JSON.stringify({ ...body, inputHash }))
writeFileSync(path.join(outputFolder, 'draft.json'), JSON.stringify(draft))
console.log(JSON.stringify({ references: inputs.length, inputHash, scales: inputs.map(i => [i.character, i.metadata.scale]) }))
