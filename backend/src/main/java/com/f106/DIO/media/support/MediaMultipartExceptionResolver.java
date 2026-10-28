package com.f106.DIO.media.support;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.ModelAndView;
import org.springframework.web.servlet.handler.AbstractHandlerExceptionResolver;

/** 컨트롤러 선택 전의 multipart 파싱 실패 중 미디어 경로만 표준 ProblemDetail로 응답한다. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class MediaMultipartExceptionResolver extends AbstractHandlerExceptionResolver {
	@Override
	protected ModelAndView doResolveException(HttpServletRequest request, HttpServletResponse response, Object handler, Exception exception) {
		if (!(exception instanceof MaxUploadSizeExceededException) || !request.getRequestURI().startsWith("/api/v1/media")) return null;
		response.setStatus(HttpStatus.PAYLOAD_TOO_LARGE.value());
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.setCharacterEncoding(StandardCharsets.UTF_8.name());
		try { response.getWriter().write("{\"status\":413,\"title\":\"Payload Too Large\",\"detail\":\"미디어 파일은 5MB 이하로 올려 주세요.\",\"code\":\"MEDIA_FILE_TOO_LARGE\"}"); }
		catch (IOException error) { return null; }
		return new ModelAndView();
	}
}
