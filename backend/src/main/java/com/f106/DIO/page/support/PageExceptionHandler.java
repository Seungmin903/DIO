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

@RestControllerAdvice(assignableTypes = {PageController.class, CanvasElementController.class})
public class PageExceptionHandler extends ResponseEntityExceptionHandler {

	@ExceptionHandler(DiaryNotFoundException.class)
	public ProblemDetail diaryNotFound(DiaryNotFoundException exception) {
		return problem(HttpStatus.NOT_FOUND, "Diary not found", "DIARY_NOT_FOUND", exception.getMessage());
	}

	@ExceptionHandler(DiaryAccessDeniedException.class)
	public ProblemDetail diaryAccessDenied(DiaryAccessDeniedException exception) {
		return problem(HttpStatus.FORBIDDEN, "Diary access denied", "DIARY_ACCESS_DENIED", exception.getMessage());
	}

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
