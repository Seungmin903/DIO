import { configuredPageIds, normalizeTemplateConfig } from '../../editor/templates/creation.js';
import { getTemplate, templateCanvasSize, TEMPLATE_VERSION } from '../../editor/templates/catalog.js';
import { normalizePaperAppearance } from '../../editor/templates/appearance.js';
import { serverTemplateConfigFor, serverTemplateReference } from '../../editor/templates/serverCatalog.js';

// 실제 생성 UI 값 → 생성 입력. 에셋 ID/버전을 안정적인 서버 코드로 매핑하며 숫자 PK를 추정하지 않는다.
// 편집 문서·로컬 ID·파일은 만들지 않는다.
export function diaryCreateInput(form) {
  const title = form.title?.trim();
  if (!title) throw new Error('다이어리 이름을 입력해 주세요.');
  const templateConfig = normalizeTemplateConfig(form.templateConfig, form.pageSize);
  const paperAppearance = normalizePaperAppearance(form.paperAppearance);
  const ids = configuredPageIds(templateConfig);
  const initialPages = ids.map(id => {
    const template = getTemplate(id);
    const dimensions = templateCanvasSize(template.orientation);
    return { templateId: template.id, ...serverTemplateReference(template.id, template.templateVersion, template.orientation),
      templateConfig: { ...dimensions, ...serverTemplateConfigFor(template.id), paperAppearance: { ...paperAppearance } } };
  });
  // PDF 쪽은 서버에 쪽마다 빈 페이지를 만든 뒤(쪽 크기는 만든 다음 맞춘다) 그 위에 쪽 그림을 깐다. 서버 속지 목록에는 PDF 가 없다.
  const importedPages = Array.isArray(form.importedPages) && form.importedPages.length ? form.importedPages : null;
  if (importedPages) {
    const blank = { templateId: null, ...serverTemplateReference(null, TEMPLATE_VERSION, templateConfig.orientation),
      templateConfig: { ...templateCanvasSize(templateConfig.orientation), paperAppearance: { ...paperAppearance, backgroundColor: '#FFFFFF' }, blank: true } };
    initialPages.splice(0, initialPages.length, ...importedPages.map(() => ({ ...blank, templateConfig: { ...blank.templateConfig } })));
  }
  // 기존 로컬 생성과 같이 모든 속지가 꺼져 있으면 빈 페이지 1장을 유지한다.
  if (!initialPages.length) initialPages.push({ templateId: null, ...serverTemplateReference(null, TEMPLATE_VERSION, templateConfig.orientation),
    templateConfig: { ...templateCanvasSize(templateConfig.orientation), paperAppearance: { ...paperAppearance }, blank: true } });
  return { title, color: form.color, pattern: form.pattern ?? null, pageSize: templateConfig.orientation,
    templateConfig, paperAppearance, initialPages, ...(importedPages ? { importedPages } : {}),
    // 표지 꾸미기는 생성 후 업로드·버전 검사를 거쳐 회원 메타데이터에 저장한다.
    ...(form.cover && typeof form.cover === 'object' ? { cover: form.cover } : {}) };
}
