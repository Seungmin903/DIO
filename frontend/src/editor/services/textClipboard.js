import * as Clipboard from 'expo-clipboard'

export async function copyText(text) {
  await Clipboard.setStringAsync(text)
}
