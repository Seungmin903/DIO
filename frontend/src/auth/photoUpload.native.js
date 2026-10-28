import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';

export async function buildPhotoBody(signup, uri, partName = 'signup') {
  const context = ImageManipulator.manipulate(uri);
  let rendered, photo;
  const dispose = () => {
    if (photo) { const file = new File(photo.uri); if (file.exists) file.delete(); }
  };
  try {
    // Picker already crops to a square; keep uploads small and use a supported format.
    context.resize({ width: 512 });
    rendered = await context.renderAsync();
    photo = await rendered.saveAsync({ format: SaveFormat.PNG, compress: 1 });
    const body = new FormData();
    body.append(partName, new Blob([JSON.stringify(signup)], { type: 'application/json' }), `${partName}.json`);
    body.append('photo', new File(photo.uri));
    return { body, dispose };
  } catch (error) { dispose(); throw error; }
  finally { rendered?.release?.(); context.release?.(); }
}
