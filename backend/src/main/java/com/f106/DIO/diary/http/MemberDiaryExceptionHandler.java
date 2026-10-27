package com.f106.DIO.diary.http;

import com.f106.DIO.diary.creation.DiaryCreationException;
import com.f106.DIO.diary.detail.DiaryDetailException;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice(assignableTypes=MemberDiaryController.class)
public class MemberDiaryExceptionHandler extends ResponseEntityExceptionHandler {
    private ResponseEntity<MemberDiaryProblem> problem(HttpStatus status,String code,String detail) {
        var response=ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).header("Cache-Control","no-store");
        if(status==HttpStatus.UNAUTHORIZED) response.header("WWW-Authenticate","Bearer");
        return response.body(new MemberDiaryProblem(status.value(),status.getReasonPhrase(),code,detail));
    }
    @ExceptionHandler(DiaryCreationException.class)
    ResponseEntity<MemberDiaryProblem> creation(DiaryCreationException error) { return problem(error.status(),error.code(),error.getMessage()); }
    @ExceptionHandler(DiaryDetailException.class)
    ResponseEntity<MemberDiaryProblem> detail(DiaryDetailException error) { return problem(error.status(),error.code(),error.getMessage()); }
    @ExceptionHandler(MemberDiaryRequestException.class)
    ResponseEntity<MemberDiaryProblem> invalid(MemberDiaryRequestException error) { return problem(HttpStatus.BAD_REQUEST,error.code,"요청 형식과 지원하는 필드를 확인해 주세요."); }
    @ExceptionHandler(com.f106.DIO.diary.creation.DiaryIdempotencyException.class)
    ResponseEntity<MemberDiaryProblem> idempotency(com.f106.DIO.diary.creation.DiaryIdempotencyException error) {
        var response=problem(error.status(),error.code(),error.getMessage());
        if(!"IDEMPOTENCY_IN_PROGRESS".equals(error.code())) return response;
        var headers=new HttpHeaders(); headers.putAll(response.getHeaders()); headers.set("Retry-After","1");
        return new ResponseEntity<>(response.getBody(),headers,response.getStatusCode());
    }
    @ExceptionHandler(org.springframework.dao.DataAccessException.class)
    ResponseEntity<MemberDiaryProblem> storage(org.springframework.dao.DataAccessException error) {
        boolean unavailable=error instanceof org.springframework.dao.DataAccessResourceFailureException
            || error instanceof org.springframework.dao.TransientDataAccessException;
        return problem(unavailable?HttpStatus.SERVICE_UNAVAILABLE:HttpStatus.INTERNAL_SERVER_ERROR,
            unavailable?"DIARY_PERSISTENCE_UNAVAILABLE":"DIARY_PERSISTENCE_FAILED","다이어리 저장소를 사용할 수 없어요. 잠시 후 다시 확인해 주세요.");
    }
    @ExceptionHandler(Exception.class)
    ResponseEntity<MemberDiaryProblem> unexpected(Exception error) {
        // SQL·본문·토큰·내부 예외 메시지를 응답이나 로그에 포함하지 않는다.
        org.slf4j.LoggerFactory.getLogger(getClass()).error("Member diary request failed: {}",error.getClass().getSimpleName());
        return problem(HttpStatus.INTERNAL_SERVER_ERROR,"DIARY_INTERNAL_ERROR","요청을 처리하지 못했어요. 잠시 후 다시 확인해 주세요.");
    }
    @Override protected ResponseEntity<Object> handleExceptionInternal(Exception ex,Object body,HttpHeaders headers,HttpStatusCode status,WebRequest request) {
        var safeHeaders=new HttpHeaders(); safeHeaders.putAll(headers);
        safeHeaders.setContentType(MediaType.APPLICATION_PROBLEM_JSON); safeHeaders.setCacheControl("no-store");
        String code=status.value()==405?"METHOD_NOT_ALLOWED":status.value()==415?"UNSUPPORTED_MEDIA_TYPE":"INVALID_MEMBER_DIARY_REQUEST";
        return new ResponseEntity<>(new MemberDiaryProblem(status.value(),HttpStatus.valueOf(status.value()).getReasonPhrase(),code,
            "요청 형식과 지원하는 필드를 확인해 주세요."),safeHeaders,status);
    }
}
