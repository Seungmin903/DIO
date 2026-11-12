import { File } from 'expo-file-system'
export const readCaptureBytes = result => new File(result.uri).bytes()
