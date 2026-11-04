// 옮기기를 끝낸 게스트 원본을 지울 때 쓰는 기기 정리 함수. 휴지통 영구 삭제(useDiaries)와 같은 것들이다.
import { forgetEditorDoc } from '../../editor/services/editorDocs'
import { forgetViewedPage } from '../../editor/services/editorViewState'
import { collectMediaIds } from '../../editor/utils/mediaReferences'
import * as mediaRepository from '../../editor/utils/mediaRepository'
import { collectPdfSourceIds } from '../utils/pdfSource'
import { removePdfSource } from '../utils/pdfSourceStore'

export const guestOriginalCleanup = {
  forgetDoc: forgetEditorDoc, forgetView: forgetViewedPage, collectMediaIds, removeMedia: mediaRepository.remove,
  collectSourceIds: collectPdfSourceIds, removeSource: removePdfSource,
}
