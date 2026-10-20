import { File } from 'expo-file-system'
export function readSvg(uri) { return new File(uri).text() }
