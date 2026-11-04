// 다이어리 문서를 페이지별 파일로 보관한다. 파일 입출력은 files 로 주입한다.
//
// 목차(manifest): 문서 정보 + 페이지별 정보(책갈피 · 속지 등 objects 를 뺀 전부)와 내용 파일 이름
// 페이지 파일: 그 페이지의 objects
//
// 저장 순서: 바뀐 내용을 새 이름의 파일로 쓴다 → 목차를 임시 파일에 쓰고 교체한다 → 안 쓰는 파일을 지운다.
// 기존 파일을 덮어쓰지 않으므로 어느 단계에서 앱이 꺼져도 목차는 온전한 한 시점을 가리킨다.
//
// unloaded 페이지(내용을 아직 읽지 않은 페이지)는 페이지 정보만 저장하고 내용 파일은 그대로 둔다.
import { pageHasContent } from '../../diary/utils/bookSpread.js'
import { decodePage, encodePage } from '../utils/strokeCodec.js'

const MANIFEST = 'manifest.json'
const MANIFEST_TMP = 'manifest.tmp'
const FORMAT_VERSION = 5
const READ_CONCURRENCY = 6
const REMEMBERED_MANIFESTS = 4

export const documentDirectory = (key) => key.replace(/[^A-Za-z0-9-]/g, (char) => `_${char.charCodeAt(0).toString(16)}_`)

async function mapLimited(items, limit, work) {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await work(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// 교체 도중 꺼지면 manifest.json 없이 완성된 manifest.tmp 만 남을 수 있다.
// manifest.json 이 있으면 tmp 는 쓰다 만 것일 수 있으므로 무시한다.
const manifestName = (names) => (names.includes(MANIFEST) ? MANIFEST : names.includes(MANIFEST_TMP) ? MANIFEST_TMP : null)

const shellOf = ({ objects, unloaded, ...shell }) => shell

export function createDocumentStore({ files }) {
  const queues = new Map() // 키별 작업 줄. 같은 문서의 읽기 · 쓰기 · 지우기가 겹치지 않게 한다.
  const manifests = new Map() // 키 → 최근 목차 (이 프로세스만 쓰므로 쓸 때 함께 갱신한다)
  const fileOfObjects = new WeakMap() // objects 배열 → { key, file }. 내용이 그대로인 페이지를 다시 쓰지 않게 한다.

  const remember = (key, manifest) => {
    manifests.delete(key)
    manifests.set(key, manifest)
    while (manifests.size > REMEMBERED_MANIFESTS) manifests.delete(manifests.keys().next().value)
  }

  function run(key, task) {
    const previous = queues.get(key) ?? Promise.resolve()
    const current = previous.then(task, task)
    const settled = current.catch(() => {})
    queues.set(key, settled)
    settled.then(() => { if (queues.get(key) === settled) queues.delete(key) })
    return current
  }

  /** 목차가 없으면 null. 목차가 깨졌거나 읽기에 실패하면 "문서 없음"으로 착각하지 않도록 reject 한다. */
  async function readManifest(key) {
    if (manifests.has(key)) return manifests.get(key)
    const dir = documentDirectory(key)
    const name = manifestName(await files.names(dir))
    if (!name) return null
    const manifest = JSON.parse(await files.read(dir, name))
    if (manifest?.version !== FORMAT_VERSION) throw new Error(`Unsupported document format: ${manifest?.version}`)
    remember(key, manifest)
    return manifest
  }

  async function removeUnused(dir, manifest) {
    const used = new Set([MANIFEST, ...(manifest.pages ?? []).map((page) => page.file)])
    const names = await files.names(dir)
    await Promise.allSettled(names.filter((name) => !used.has(name)).map((name) => files.remove(dir, name)))
  }

  /** 목차 항목의 내용을 읽어 온전한 페이지로 만든다. */
  async function readEntry(key, entry) {
    if (!entry.file) return { ...entry.shell }
    const { objects } = decodePage(JSON.parse(await files.read(documentDirectory(key), entry.file)))
    fileOfObjects.set(objects, { key, file: entry.file })
    return { ...entry.shell, objects }
  }

  async function readInQueue(key) {
    const manifest = await readManifest(key)
    if (!manifest) return null
    if (!manifest.pages) return manifest.doc
    const pages = await mapLimited(manifest.pages, READ_CONCURRENCY, (entry) => readEntry(key, entry))
    return { ...manifest.doc, pages }
  }

  async function writeInQueue(key, doc) {
    const dir = documentDirectory(key)
    await files.ensure(dir)
    // 임시 목차만 남아 있으면 먼저 제자리로 옮긴다. 그대로 두면 아래에서 덮어쓰는 동안 유일한 목차가 깨질 수 있다.
    if (manifestName(await files.names(dir)) === MANIFEST_TMP) await files.replace(dir, MANIFEST_TMP, MANIFEST)
    const previous = await readManifest(key)
    const previousById = new Map((previous?.pages ?? []).map((entry) => [entry.shell?.id, entry]))
    const fileBytes = new Map((previous?.pages ?? []).filter((entry) => entry.file).map((entry) => [entry.file, entry.bytes])) // 지금 있는 파일 → 크기
    let nextFile = previous?.nextFile ?? 1
    const { pages, ...rest } = doc
    const manifest = { version: FORMAT_VERSION, key, doc: rest, pages: null, nextFile }
    if (Array.isArray(pages)) {
      manifest.pages = []
      for (const page of pages) {
        if (page?.unloaded) {
          // 내용을 읽지 않은 페이지는 파일을 그대로 쓴다. 파일을 찾지 못하면 저장 전체를 거부해 빈 페이지로 덮어쓰지 않는다.
          const known = previousById.get(page.id)
          if (!known?.file) throw new Error(`Unloaded page has no file: ${page.id}`)
          manifest.pages.push({ shell: shellOf(page), file: known.file, filled: known.filled, bytes: known.bytes })
          continue
        }
        if (!Array.isArray(page?.objects)) {
          manifest.pages.push({ shell: page ? shellOf(page) : {}, file: null, filled: false, bytes: 0 })
          continue
        }
        const known = fileOfObjects.get(page.objects)
        // 되돌리기로 돌아온 옛 내용은 파일이 이미 지워졌을 수 있다. 지금 있는 파일만 다시 쓴다.
        let file = known?.key === key && fileBytes.has(known.file) ? known.file : null
        if (!file) {
          file = `p${nextFile}.json`
          nextFile += 1
          const text = JSON.stringify(encodePage({ objects: page.objects }))
          await files.write(dir, file, text)
          fileBytes.set(file, text.length)
          fileOfObjects.set(page.objects, { key, file })
        }
        manifest.pages.push({ shell: shellOf(page), file, filled: pageHasContent(page), bytes: fileBytes.get(file) ?? 0 })
      }
      manifest.nextFile = nextFile
    } else {
      manifest.doc = doc
    }
    await files.write(dir, MANIFEST_TMP, JSON.stringify(manifest))
    await files.replace(dir, MANIFEST_TMP, MANIFEST)
    remember(key, manifest)
    await removeUnused(dir, manifest).catch(() => {})
  }

  const removeInQueue = async (key) => {
    manifests.delete(key)
    await files.removeAll(documentDirectory(key))
  }

  return {
    readDocument: (key) => run(key, () => readInQueue(key)),
    writeDocument: (key, doc) => run(key, () => writeInQueue(key, doc)),
    /** 목차만 읽는다. 페이지 파일은 건드리지 않는다. */
    readSummary: (key) => run(key, async () => {
      const manifest = await readManifest(key)
      if (!manifest?.pages) return null
      return {
        doc: manifest.doc,
        pageCount: manifest.pages.length,
        filled: manifest.pages.map((page) => page.filled),
        bytes: manifest.pages.reduce((sum, page) => sum + (page.bytes ?? 0), 0),
      }
    }),
    /** 내용 없이 페이지 정보만 있는 문서. 내용 파일이 있는 페이지는 unloaded 로 표시한다. */
    readOutline: (key) => run(key, async () => {
      const manifest = await readManifest(key)
      if (!manifest?.pages) return null
      return {
        ...manifest.doc,
        pages: manifest.pages.map((entry) => (entry.file ? { ...entry.shell, objects: [], unloaded: true } : { ...entry.shell })),
      }
    }),
    /** 지정한 번호(0부터)의 페이지만 읽는다. */
    readPagesAt: (key, indexes) => run(key, async () => {
      const manifest = await readManifest(key)
      if (!manifest?.pages) return null
      return mapLimited(indexes, READ_CONCURRENCY, (index) => readEntry(key, manifest.pages[index]))
    }),
    /** 지정한 id 페이지의 내용만 읽는다. { id, objects } 목록. 지금 목차에 없는 id 는 건너뛴다. */
    readObjects: (key, ids) => run(key, async () => {
      const manifest = await readManifest(key)
      if (!manifest?.pages) return []
      const wanted = new Set(ids)
      const entries = manifest.pages.filter((entry) => entry.file && wanted.has(entry.shell.id))
      return mapLimited(entries, READ_CONCURRENCY, async (entry) => {
        const { objects } = await readEntry(key, entry)
        return { id: entry.shell.id, objects }
      })
    }),
    removeDocument: (key) => run(key, () => removeInQueue(key)),
    /** 목차가 있는 문서의 키 목록. 목차가 없거나 깨진 폴더는 목록에서만 뺀다. */
    async listKeys() {
      const keys = []
      for (const dir of await files.directories()) {
        try {
          const name = manifestName(await files.names(dir))
          if (name) keys.push(JSON.parse(await files.read(dir, name)).key)
        } catch { /* 파일은 지우지 않는다. */ }
      }
      return keys.filter((key) => typeof key === 'string')
    },
    /** 같은 키의 다른 작업과 겹치지 않게 task 를 실행한다. task 안에서는 *InQueue 를 쓴다. */
    exclusive: run,
    readInQueue,
    writeInQueue,
    readManifest,
    removeInQueue,
    forget: (key) => { manifests.delete(key) },
  }
}
