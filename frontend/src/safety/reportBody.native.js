import { File } from 'expo-file-system';
import { validateEvidence } from './safetyModel.js';

export async function buildReportBody(report, photos) {
  const body = new FormData();
  body.append('report', new Blob([JSON.stringify(report)], { type: 'application/json' }), 'report.json');
  for (const photo of photos) {
    const file = new File(photo.uri);
    const error = validateEvidence({ ...photo, size: file.size });
    if (error) throw new Error(error);
    body.append('evidenceFiles', file, photo.fileName);
  }
  // Evidence is not a profile photo: preserve its bytes and aspect ratio, never resize/crop or delete the user's file.
  return { body, dispose() {} };
}
