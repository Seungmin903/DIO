package com.f106.DIO.media.support;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/** Multipart 파싱은 컨트롤러 선택 전에도 실패할 수 있어 전역 Advice가 필요하다. */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class MultipartUploadExceptionHandler {
	@ExceptionHandler(MaxUploadSizeExceededException.class)
	public ResponseEntity<ProblemDetail> tooLarge(HttpServletRequest request) {
		boolean mediaRequest = request.getRequestURI().startsWith("/api/v1/media");
		String code = mediaRequest ? "MEDIA_FILE_TOO_LARGE" : "REQUEST_TOO_LARGE";
		String detail = mediaRequest ? "미디어 파일은 5MB 이하로 올려 주세요." : "요청 본문 크기가 허용 범위를 초과했습니다.";
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.PAYLOAD_TOO_LARGE, detail);
		problem.setTitle("Payload Too Large");
		problem.setProperty("code", code);
		return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
	}
}
