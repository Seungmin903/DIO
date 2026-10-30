import * as pdfjs from './pdf.min.mjs'
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', import.meta.url).href
globalThis.DIOPdf = pdfjs
