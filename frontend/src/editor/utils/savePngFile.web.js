import { saveWebFile } from './saveWebFile.js'

export const savePngFile = (result, fileName, options) => saveWebFile(result, fileName, { mimeType: 'image/png', extension: '.png', description: 'PNG 이미지', ...options })
