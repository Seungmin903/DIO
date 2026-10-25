import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';

export async function buildPhotoBody(signup, uri) {
  const context = ImageManipulator.manipulate(uri);
  let rendered, photo;
  const json = new File(Paths.cache, `dio-signup-${randomUUID()}.json`);
  const dispose = () => {
    if (json.exists) json.delete();
    if (photo) { const file = new File(photo.uri); if (file.exists) file.delete(); }
  };
  try {
    // Picker already crops to a square; keep uploads small and use a supported format.
    context.resize({ width: 512 });
    rendered = await context.renderAsync();
    photo = await rendered.saveAsync({ format: SaveFormat.PNG, compress: 1 });
    json.create(); json.write(JSON.stringify(signup));
    const body = new FormData();
    body.append('signup', { uri: json.uri, name: 'signup.json', type: 'application/json' });
    body.append('photo', { uri: photo.uri, name: 'profile.png', type: 'image/png' });
    return { body, dispose };
  } catch (error) { dispose(); throw error; }
  finally { rendered?.release?.(); context.release?.(); }
}
