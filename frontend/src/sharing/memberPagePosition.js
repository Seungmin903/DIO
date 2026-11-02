const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

// Serialize writes and coalesce navigation while a request is in flight.
// A failed write stays pending until the next navigation or foreground retry.
export function createMemberPagePosition({ transport, diaryId, isActive = () => true }) {
  let pending = null, saved = null, running = null, controller = null, disposed = false
  const active = () => !disposed && isActive()
  function flush() {
    if (running) return running
    running = (async () => {
      while (active() && pending && pending !== saved) {
        const pageId = pending
        controller = new AbortController()
        const timer = setTimeout(() => controller?.abort(), 15000)
        try {
          await transport({ method: 'PATCH', path: `/diaries/${diaryId}/membership`,
            body: { lastOpenedPageId: pageId }, signal: controller.signal })
          if (active()) saved = pageId
        } catch { return false }
        finally { clearTimeout(timer); controller = null }
      }
      return active()
    })().finally(() => { running = null })
    return running
  }
  return {
    visit(pageId) {
      if (!active() || !uuid(diaryId) || !uuid(pageId)) return Promise.resolve(false)
      pending = pageId
      return flush()
    },
    dispose() { disposed = true; controller?.abort() },
  }
}
