package com.f106.DIO.page.support;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import com.f106.DIO.diary.support.DiaryNotFoundException;
import com.f106.DIO.page.controller.CanvasElementController;
import com.f106.DIO.page.controller.PageController;

@RestControllerAdvice(assignableTypes = {PageController.class, CanvasElementController.class})
public class PageExceptionHandler extends ResponseEntityExceptionHandler {

	@ExceptionHandler(DiaryNotFoundException.class)
	public ProblemDetail handleDiaryNotFound(DiaryNotFoundException exception) {
		return problem(HttpStatus.NOT_FOUND, "Diary not found", "DIARY_NOT_FOUND", exception.getMessage());
	}

	@ExceptionHandler(PageNotFoundException.class)
	public ProblemDetail handlePageNotFound(PageNotFoundException exception) {
		return problem(HttpStatus.NOT_FOUND, "Page not found", "PAGE_NOT_FOUND", exception.getMessage());
	}

	@ExceptionHandler(PageTemplateNotFoundException.class)
	public ProblemDetail handleTemplateNotFound(PageTemplateNotFoundException exception) {
		return problem(HttpStatus.NOT_FOUND, "Page template not found", "PAGE_TEMPLATE_NOT_FOUND", exception.getMessage());
	}

	@ExceptionHandler(CanvasElementNotFoundException.class)
	public ProblemDetail handleElementNotFound(CanvasElementNotFoundException exception) {
		return problem(HttpStatus.NOT_FOUND, "Canvas element not found", "ELEMENT_NOT_FOUND", exception.getMessage());
	}

	@ExceptionHandler(ElementNotDeletedException.class)
	public ProblemDetail handleElementNotDeleted(ElementNotDeletedException exception) {
		return problem(HttpStatus.CONFLICT, "Canvas element not deleted", "ELEMENT_NOT_DELETED", exception.getMessage());
	}

	@ExceptionHandler(DuplicateCanvasElementException.class)
	public ProblemDetail handleDuplicateElement(DuplicateCanvasElementException exception) {
		return problem(HttpStatus.CONFLICT, "Duplicate canvas element", "ELEMENT_ALREADY_EXISTS", exception.getMessage());
	}

	@ExceptionHandler(ObjectOptimisticLockingFailureException.class)
	public ProblemDetail handleVersionConflict(ObjectOptimisticLockingFailureException exception) {
		return problem(HttpStatus.CONFLICT, "Version conflict", "VERSION_CONFLICT", "다른 변경과 충돌했습니다. 최신 상태를 다시 불러오세요.");
	}

	@ExceptionHandler(DataIntegrityViolationException.class)
	public ProblemDetail handleIntegrityViolation(DataIntegrityViolationException exception) {
		return problem(HttpStatus.CONFLICT, "Data conflict", "DATA_CONFLICT", "참조하는 데이터가 없거나 저장 규칙과 맞지 않습니다.");
	}

	@ExceptionHandler(IllegalArgumentException.class)
	public ProblemDetail handleBadRequest(IllegalArgumentException exception) {
		return problem(HttpStatus.BAD_REQUEST, "Bad request", "INVALID_REQUEST", exception.getMessage());
	}

	private static ProblemDetail problem(HttpStatus status, String title, String code, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setTitle(title);
		problem.setProperty("code", code);
		return problem;
	}
}
