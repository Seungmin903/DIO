import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import EditorModal from '../editor/components/controls/EditorModal';
import PhotoCropper from '../editor/components/panels/PhotoCropper';
import { notify } from '../shared/dialogs';
import { colors } from '../shared/theme';
import { profileCropStore } from './profileCrop';

const WORK_SIDE = 2400; // 자르기 화면에 띄우는 사진의 긴 변(큰 원본은 줄여서 다룬다)
const OUTPUT_SIDE = 1024; // 자른 프로필 사진의 최대 변(올릴 때는 photoUpload 가 다시 512 로 줄인다)

// 앱 맨 위에 한 번 둔다. 프로필 사진을 고르면 기기 기본 자르기 화면 대신 앱의 사진 창(PhotoCropper, 모든 사진 넣기와 같은 창)에서 동그라미로 맞춘다.
export default function ProfileCropHost() {
  useEffect(() => profileCropStore.attach(), []);
  const request = useSyncExternalStore(profileCropStore.subscribe, profileCropStore.getSnapshot, profileCropStore.getSnapshot);
  return request ? <ProfileCropper key={request.id} asset={request.asset} onDone={uri => profileCropStore.settle(uri, request.id)} /> : null;
}

async function render(uri, apply, format = SaveFormat.JPEG) {
  const context = ImageManipulator.manipulate(uri);
  let rendered;
  try {
    apply?.(context);
    rendered = await context.renderAsync();
    return await rendered.saveAsync({ format, compress: 0.92 });
  } finally {
    rendered?.release?.();
    context.release?.();
  }
}

// 사진 방향(EXIF)을 바로 세우고 큰 사진은 줄여, 화면에 보이는 사진과 잘라 내는 사진의 픽셀이 같게 한다.
async function prepare(uri) {
  const plain = await render(uri);
  const long = Math.max(plain.width, plain.height);
  if (long <= WORK_SIDE) return plain;
  return render(plain.uri, context => context.resize(plain.width >= plain.height ? { width: WORK_SIDE } : { height: WORK_SIDE }));
}

// 프로필은 원을 고정하고 사진만 이동·확대한다. 일반 사진·표지는 기존 틀 이동을 유지한다.
// 적용하면 틀 영역(사진 안 0~1)을 사진 픽셀로 바꿔 정사각형으로 잘라 저장한다(최대 OUTPUT_SIDE).
export function ProfileCropper({ asset, onDone }) {
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    prepare(asset.uri).then(
      value => { if (alive) setPhoto(value); },
      () => {
        if (!alive) return;
        onDone(null);
        notify('사진을 불러오지 못했어요', '다른 사진을 골라 주세요.');
      },
    );
    return () => { alive = false; };
  }, [asset.uri]);

  const apply = async ({ rect }) => {
    if (!photo || busy) return;
    setBusy(true);
    try {
      const size = Math.max(1, Math.round(Math.min((rect.u1 - rect.u0) * photo.width, (rect.v1 - rect.v0) * photo.height)));
      const originX = Math.min(photo.width - size, Math.max(0, Math.round(rect.u0 * photo.width)));
      const originY = Math.min(photo.height - size, Math.max(0, Math.round(rect.v0 * photo.height)));
      const out = Math.min(OUTPUT_SIDE, size);
      const saved = await render(photo.uri, context => context.crop({ originX, originY, width: size, height: size }).resize({ width: out, height: out }));
      onDone(saved.uri);
    } catch {
      setBusy(false);
      notify('사진을 자르지 못했어요', '다시 시도해 주세요.');
    }
  };

  // 사진을 바로 세우는 동안은 작은 기다림 표시만
  if (!photo) {
    return (
      <EditorModal visible transparent animationType="none" onRequestClose={() => onDone(null)}>
        <View style={s.loading}><ActivityIndicator color={colors.primaryStrong} accessibilityLabel="사진 준비 중" /></View>
      </EditorModal>
    );
  }
  return (
    <PhotoCropper
      photo={{ id: 'profile-photo', type: 'photo', frame: 'none', src: photo.uri, imageWidth: photo.width, imageHeight: photo.height, x: 0, y: 0, w: 100, h: 100 }}
      round
      fixedViewport
      fixedAspect={1}
      title="프로필 사진 자르기"
      onCancel={() => onDone(null)}
      onApply={apply}
    />
  );
}

const s = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlay },
});
