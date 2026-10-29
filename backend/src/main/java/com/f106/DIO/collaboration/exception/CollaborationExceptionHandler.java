package com.f106.DIO.collaboration.exception;
import com.f106.DIO.collaboration.controller.CanvasCollaborationController;
import com.f106.DIO.diary.support.*;
import com.f106.DIO.page.support.*;
import org.springframework.http.*;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
@RestControllerAdvice(assignableTypes=CanvasCollaborationController.class)
public class CollaborationExceptionHandler extends ResponseEntityExceptionHandler {
    @ExceptionHandler(CollaborationException.class) public ProblemDetail collaboration(CollaborationException error){return problem(error.status,error.code,error.getMessage());}
    @ExceptionHandler({CanvasElementVersionConflictException.class,ObjectOptimisticLockingFailureException.class}) public ProblemDetail conflict(Exception error){return problem(HttpStatus.CONFLICT,"CANVAS_VERSION_CONFLICT","다른 변경이 먼저 저장됐어요. 최신 내용을 확인해 주세요.");}
    @ExceptionHandler({CanvasElementNotFoundException.class,PageNotFoundException.class,DiaryNotFoundException.class}) public ProblemDetail missing(Exception error){return problem(HttpStatus.NOT_FOUND,"CANVAS_ELEMENT_NOT_FOUND","페이지 또는 요소를 찾을 수 없어요.");}
    @ExceptionHandler(DiaryAccessDeniedException.class) public ProblemDetail forbidden(Exception error){return problem(HttpStatus.FORBIDDEN,"COLLABORATION_ACCESS_DENIED","편집 권한이 없어요.");}
    @ExceptionHandler(ElementNotDeletedException.class) public ProblemDetail active(Exception error){return problem(HttpStatus.CONFLICT,"CANVAS_ELEMENT_NOT_DELETED","이미 활성화된 요소예요.");}
    @ExceptionHandler({IllegalArgumentException.class,MediaFileNotSupportedException.class}) public ProblemDetail invalid(Exception error){return problem(HttpStatus.BAD_REQUEST,"INVALID_CANVAS_OPERATION","작업의 요소 속성·참조를 확인해 주세요.");}
    private ProblemDetail problem(HttpStatus status,String code,String message){var detail=ProblemDetail.forStatusAndDetail(status,message);detail.setProperty("code",code);return detail;}
}
