import { Directory, File, Paths } from 'expo-file-system'

const root = () => new Directory(Paths.document, 'dio-documents')
const folder = (dir) => new Directory(root(), dir)

export const documentFiles = {
  async directories() {
    const base = root()
    if (!base.exists) return []
    return base.list().filter((item) => item instanceof Directory).map((item) => item.name)
  },
  async names(dir) {
    const target = folder(dir)
    if (!target.exists) return []
    return target.list().filter((item) => item instanceof File).map((item) => item.name)
  },
  async ensure(dir) { folder(dir).create({ intermediates: true, idempotent: true }) },
  read: (dir, name) => new File(folder(dir), name).text(),
  async write(dir, name, text) { await new File(folder(dir), name).write(text) },
  async replace(dir, from, to) { await new File(folder(dir), from).move(new File(folder(dir), to), { overwrite: true }) },
  async remove(dir, name) { new File(folder(dir), name).delete() },
  async removeAll(dir) {
    const target = folder(dir)
    if (target.exists) target.delete()
  },
}
