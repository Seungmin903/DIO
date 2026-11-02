package com.f106.DIO.cutout.support;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.http.converter.HttpMessageNotReadableException;
import com.f106.DIO.cutout.controller.StickerCutoutController;
import com.f106.DIO.media.storage.MediaStorageException;
import com.f106.DIO.media.support.MediaRequestException;

@RestControllerAdvice(assignableTypes = StickerCutoutController.class)
public class CutoutExceptionHandler {
	@ExceptionHandler(CutoutException.class) public ResponseEntity<ProblemDetail> cutout(CutoutException exception) {
		var response = ResponseEntity.status(exception.status());
		if ("CUTOUT_BUSY".equals(exception.code())) response.header("Retry-After", "2");
		return response.body(problem(exception.status(), exception.code(), exception.getMessage()));
	}
	@ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class}) public ProblemDetail invalid(Exception exception) {
		CutoutException invalid = CutoutException.invalidSelection();
		return problem(invalid.status(), invalid.code(), invalid.getMessage());
	}
	// 저장 단계는 미디어 보관함 규칙(용량·동시 업로드)을 그대로 따른다.
	@ExceptionHandler(MediaRequestException.class) public ProblemDetail media(MediaRequestException exception) { return problem(exception.status(), exception.code(), exception.getMessage()); }
	@ExceptionHandler(MediaStorageException.class) public ProblemDetail storage(MediaStorageException exception) { return problem(exception.status(), exception.code(), exception.getMessage()); }
	private static ProblemDetail problem(HttpStatus status, String code, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail); problem.setTitle(status.getReasonPhrase()); problem.setProperty("code", code); return problem;
	}
}
