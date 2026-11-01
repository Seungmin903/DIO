import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Image, PanResponder, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import EditorModal from '../editor/components/controls/EditorModal';
import Slider from '../editor/components/controls/Slider';
import DioButton from '../shared/DioButton';
import { MakerBar, MakerHeader, MakerStage } from '../shared/MakerKit';
import { notify } from '../shared/dialogs';
import { colors } from '../shared/theme';
import { cropRect, cropView, profileCropStore } from './profileCrop';

const ZOOM_MAX = 5;
const RING_PAD = 24; // 동그라미 틀 둘레로 흐리게 보여 주는 사진 여유
const WORK_SIDE = 2400; // 자르기 화면에 띄우는 사진의 긴 변(큰 원본은 줄여서 다룬다)
const OUTPUT_SIDE = 1024; // 자른 프로필 사진의 최대 변(올릴 때는 photoUpload 가 다시 512 로 줄인다)

// 앱 맨 위에 한 번 둔다. 프로필 사진을 고르면 기기 기본 자르기 화면 대신 이 화면(제작 화면 문법)에서 동그라미로 맞춘다.
export default function ProfileCropHost() {
  useEffect(() => profileCropStore.attach(), []);
  const request = useSyncExternalStore(profileCropStore.subscribe, profileCropStore.getSnapshot, profileCropStore.getSnapshot);
  return (
    <EditorModal visible={Boolean(request)} transparent animationType="none" onRequestClose={() => profileCropStore.settle(null)}>
      {request ? <ProfileCropper key={request.id} asset={request.asset} onDone={uri => profileCropStore.settle(uri)} /> : null}
    </EditorModal>
  );
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

export function ProfileCropper({ asset, onDone }) {
  const window = useWindowDimensions();
  const compact = window.width < 600;
  const [photo, setPhoto] = useState(null);
  const [area, setArea] = useState(null);
  const [view, setView] = useState({ zoom: 1, cx: 0, cy: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    prepare(asset.uri).then(
      value => {
        if (!alive) return;
        setPhoto(value);
        setView({ zoom: 1, cx: value.width / 2, cy: value.height / 2 });
      },
      () => {
        if (!alive) return;
        onDone(null);
        notify('사진을 불러오지 못했어요', '다른 사진을 골라 주세요.');
      },
    );
    return () => { alive = false; };
  }, [asset.uri]);

  // 작업 판: 남은 자리(여백 16 · 확대 막대 자리 72 를 뺀)에서 가장 큰 정사각형
  const side = area ? Math.max(160, Math.min(560, area.width - 32, area.height - 32 - 72)) : 0;
  const frame = side - RING_PAD * 2;
  const geometry = photo && side ? { width: photo.width, height: photo.height, frame } : null;
  const fitted = geometry ? cropView({ ...geometry, ...view }) : null;

  const latest = useRef({});
  latest.current = { geometry, view };
  const gesture = useRef(null);
  const responder = useMemo(() => {
    const points = event => {
      const touches = event.nativeEvent.touches;
      return touches?.length ? touches : [event.nativeEvent];
    };
    const begin = list => {
      const { geometry: g, view: v } = latest.current;
      if (!g) return (gesture.current = null);
      const fit = cropView({ ...g, ...v });
      const [a, b] = list;
      gesture.current = b
        ? { pinch: true, zoom: v.zoom, cx: fit.cx, cy: fit.cy, x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2, d: Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)) }
        : { pinch: false, zoom: v.zoom, cx: fit.cx, cy: fit.cy, x: a.pageX, y: a.pageY };
    };
    const move = event => {
      const list = points(event);
      const pinch = list.length > 1;
      if (!gesture.current || gesture.current.pinch !== pinch) begin(list);
      const start = gesture.current, g = latest.current.geometry;
      if (!start || !g) return;
      const [a, b] = list;
      const zoom = pinch ? Math.min(ZOOM_MAX, Math.max(1, start.zoom * Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) / start.d)) : start.zoom;
      const x = pinch ? (a.pageX + b.pageX) / 2 : a.pageX, y = pinch ? (a.pageY + b.pageY) / 2 : a.pageY;
      const scale = cropView({ ...g, zoom, cx: start.cx, cy: start.cy }).scale;
      const next = cropView({ ...g, zoom, cx: start.cx - (x - start.x) / scale, cy: start.cy - (y - start.y) / scale });
      setView({ zoom, cx: next.cx, cy: next.cy });
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: event => begin(points(event)),
      onPanResponderMove: move,
      onPanResponderRelease: () => { gesture.current = null; },
      onPanResponderTerminate: () => { gesture.current = null; },
    });
  }, []);

  const apply = async () => {
    if (!geometry || busy) return;
    setBusy(true);
    try {
      const rect = cropRect({ ...geometry, ...view });
      const out = Math.min(OUTPUT_SIDE, rect.width);
      const saved = await render(photo.uri, context => context.crop(rect).resize({ width: out, height: out }));
      onDone(saved.uri);
    } catch {
      setBusy(false);
      notify('사진을 자르지 못했어요', '다시 시도해 주세요.');
    }
  };

  const c = side / 2, r = frame / 2;
  const shade = `M0 0H${side}V${side}H0Z M${c - r} ${c}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
  return (
    <SafeAreaView style={s.backdrop}>
      <MakerHeader title="사진 자르기" compact={compact} busy={busy} onClose={() => onDone(null)} closeLabel="사진 자르기 닫기" />
      <View style={s.body} onLayout={event => setArea(event.nativeEvent.layout)}>
        {side > 0 && (
          <>
            <MakerStage testID="profile-crop-stage" style={{ width: side, height: side }} {...(fitted ? responder.panHandlers : {})}>
              {fitted ? (
                <>
                  <Image
                    source={{ uri: photo.uri }}
                    accessibilityLabel="자를 사진"
                    style={{ position: 'absolute', left: c - fitted.cx * fitted.scale, top: c - fitted.cy * fitted.scale, width: photo.width * fitted.scale, height: photo.height * fitted.scale }}
                  />
                  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <Svg width={side} height={side}>
                      <Path d={shade} fill={colors.overlay} fillRule="evenodd" />
                      <Circle cx={c} cy={c} r={r} fill="none" stroke={colors.surface} strokeWidth={2} />
                    </Svg>
                  </View>
                </>
              ) : (
                <View style={s.loading}><ActivityIndicator color={colors.primaryStrong} /></View>
              )}
            </MakerStage>
            <View style={{ width: side }}>
              <Slider
                value={view.zoom}
                min={1}
                max={ZOOM_MAX}
                step={0.1}
                minusLabel="사진 축소"
                plusLabel="사진 확대"
                scale={100}
                unit="%"
                label="확대"
                onChange={zoom => geometry && setView(prev => {
                  const next = cropView({ ...geometry, ...prev, zoom });
                  return { zoom, cx: next.cx, cy: next.cy };
                })}
              />
            </View>
          </>
        )}
      </View>
      <MakerBar stacked={compact}>
        <DioButton variant="filled" label="적용" block={compact} disabled={!fitted || busy} onPress={apply} />
      </MakerBar>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.surface },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 16 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
