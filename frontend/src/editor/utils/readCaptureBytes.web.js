export async function readCaptureBytes(result) {
  const blob = result.blob ?? await (await fetch(result.uri)).blob()
  return new Uint8Array(await blob.arrayBuffer())
}
