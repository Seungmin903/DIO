package com.f106.DIO.page.support;

import org.springframework.http.HttpStatus;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import com.f106.DIO.diary.support.DiaryNotFoundException;
import com.f106.DIO.diary.support.DiaryAccessDeniedException;
import com.f106.DIO.page.controller.CanvasElementController;
import com.f106.DIO.page.controller.PageController;
import com.f106.DIO.page.domain.DiaryPage;

@RestControllerAdvice(assignableTypes = {PageController.class, CanvasElementController.class})
public class PageExceptionHandler extends ResponseEntityExceptionHandler {
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(PageExceptionHandler.class);
    // 서버에 없는 속지(오타 · 없는 버전 · 내린 속지): 앱 업데이트로 풀릴 수 있는 요청 오류라 400 이되 다른 400과 코드를 나눈다
    @ExceptionHandler(UnknownPageTemplateException.class)
    public ProblemDetail unknownTemplate(UnknownPageTemplateException error){return problem(HttpStatus.BAD_REQUEST,"Unknown page template","UNKNOWN_PAGE_TEMPLATE",error.getMessage());}
    // 속지 목록 데이터 문제(같은 코드 · 버전의 활성 행 여럿)는 사용자 오류가 아니라 서버 오류(500)로 알리고, 운영자가 찾을 수 있게 코드 · 버전을 남긴다
    @ExceptionHandler(PageTemplateCatalogException.class)
    public ProblemDetail invalidTemplateCatalog(PageTemplateCatalogException error){
        log.error("page_templates 에 같은 코드 · 버전의 활성 행이 {}개 있어 페이지를 만들지 못했습니다: {} / {}",error.activeRows(),error.templateCode(),error.templateVersion());
        return problem(HttpStatus.INTERNAL_SERVER_ERROR,"Page template catalog invalid","PAGE_TEMPLATE_CATALOG_INVALID",error.getMessage());
    }
    @ExceptionHandler(com.f106.DIO.media.support.MediaFileNotFoundException.class)
    public ProblemDetail missingMedia(com.f106.DIO.media.support.MediaFileNotFoundException error){var result=ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND,"이미지 파일 또는 접근 권한을 확인해 주세요.");result.setProperty("code","MEDIA_FILE_NOT_FOUND");return result;}


    @ExceptionHandler(com.f106.DIO.collaboration.exception.CollaborationException.class)
    public ProblemDetail collaboration(com.f106.DIO.collaboration.exception.CollaborationException error){return problem(error.status,"Canvas operation failed",error.code,error.getMessage());}

	@ExceptionHandler(DiaryNotFoundException.class)
	public ProblemDetail diaryNotFound(DiaryNotFoundException exception) {
		return problem(HttpStatus.NOT_FOUND, "Diary not found", "DIARY_NOT_FOUND", exception.getMessage());
	}

	@ExceptionHandler(DiaryAccessDeniedException.class)
	public ProblemDetail diaryAccessDenied(DiaryAccessDeniedException exception) {
		return problem(HttpStatus.FORBIDDEN, "Diary access denied", "DIARY_ACCESS_DENIED", exception.getMessage());
	}

    @ExceptionHandler(PageCreationConflictException.class)
    public ProblemDetail pageCreationConflict(PageCreationConflictException error){return problem(HttpStatus.CONFLICT,"Page creation conflict","PAGE_CREATION_CONFLICT",error.getMessage());}

	@ExceptionHandler(PageNotFoundException.class)
	public ProblemDetail pageNotFound(PageNotFoundException exception) {
		return problem(HttpStatus.NOT_FOUND, "Page not found", "PAGE_NOT_FOUND", exception.getMessage());
	}

	@ExceptionHandler(CanvasElementNotFoundException.class)
	public ProblemDetail elementNotFound(CanvasElementNotFoundException exception) {
		return problem(HttpStatus.NOT_FOUND, "Canvas element not found", "CANVAS_ELEMENT_NOT_FOUND", exception.getMessage());
	}

	@ExceptionHandler(PageTemplateNotFoundException.class)
	public ProblemDetail pageTemplateNotFound(PageTemplateNotFoundException exception) {
		return problem(HttpStatus.NOT_FOUND, "Page template not found", "PAGE_TEMPLATE_NOT_FOUND", exception.getMessage());
	}

	@ExceptionHandler(ElementNotDeletedException.class)
	public ProblemDetail elementNotDeleted(ElementNotDeletedException exception) {
		return problem(HttpStatus.CONFLICT, "Canvas element is active", "CANVAS_ELEMENT_NOT_DELETED", exception.getMessage());
	}

	@ExceptionHandler(CanvasElementVersionConflictException.class)
	public ProblemDetail staleElementVersion(CanvasElementVersionConflictException exception) {
		return problem(HttpStatus.CONFLICT, "Concurrent canvas update", "CANVAS_ELEMENT_VERSION_CONFLICT", exception.getMessage());
	}

	@ExceptionHandler(MediaFileNotSupportedException.class)
	public ProblemDetail mediaFileNotSupported(MediaFileNotSupportedException exception) {
		return problem(HttpStatus.BAD_REQUEST, "Media file not supported", "MEDIA_FILE_NOT_SUPPORTED", exception.getMessage());
	}

	@ExceptionHandler(IllegalArgumentException.class)
	public ProblemDetail invalidRequest(IllegalArgumentException exception) {
		return problem(HttpStatus.BAD_REQUEST, "Invalid page request", "INVALID_PAGE_REQUEST", exception.getMessage());
	}

	@ExceptionHandler(ObjectOptimisticLockingFailureException.class)
	public ProblemDetail concurrentModification(ObjectOptimisticLockingFailureException exception) {
		// DiaryPage와 CanvasElement 모두 @Version을 쓰므로 충돌한 엔티티로 코드를 나눈다.
		if (DiaryPage.class.getName().equals(exception.getPersistentClassName())) {
			return problem(HttpStatus.CONFLICT, "Concurrent page update", "PAGE_VERSION_CONFLICT",
				"다른 사용자가 페이지를 먼저 변경했습니다. 최신 내용을 조회한 뒤 다시 시도해 주세요.");
		}
		return problem(HttpStatus.CONFLICT, "Concurrent canvas update", "CANVAS_ELEMENT_VERSION_CONFLICT",
			"다른 사용자의 변경이 먼저 저장되었습니다. 최신 내용을 조회한 뒤 다시 시도해 주세요.");
	}

	private static ProblemDetail problem(HttpStatus status, String title, String code, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setTitle(title);
		problem.setProperty("code", code);
		return problem;
	}
}
