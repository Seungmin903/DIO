import { validateEvidence } from './safetyModel.js';

export async function buildReportBody(report, photos) {
  const body = new FormData();
  body.append('report', new Blob([JSON.stringify(report)], { type: 'application/json' }), 'report.json');
  for (const photo of photos) {
    if (!/^(blob:|data:image\/(png|jpeg)[;,])/i.test(photo.uri)) throw new Error('증빙 사진을 다시 선택해 주세요.');
    const response = await fetch(photo.uri);
    if (!response.ok) throw new Error('증빙 사진을 읽지 못했어요. 다시 선택해 주세요.');
    const blob = await response.blob();
    const error = validateEvidence({ ...photo, mimeType: blob.type, size: blob.size });
    if (error) throw new Error(error);
    body.append('evidenceFiles', blob, photo.fileName);
  }
  return { body, dispose() {} };
}
