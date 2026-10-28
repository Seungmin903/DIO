package com.f106.DIO.diary.read;

import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice(assignableTypes = {DiaryReadController.class, com.f106.DIO.diary.trash.AccountDiaryTrashController.class, com.f106.DIO.diary.update.AccountDiaryUpdateController.class, com.f106.DIO.diary.create.AccountDiaryCreateController.class})
public class DiaryReadExceptionHandler extends ResponseEntityExceptionHandler {
    @ExceptionHandler(DiaryReadException.class)
    ProblemDetail handle(DiaryReadException error) {
        var problem = ProblemDetail.forStatusAndDetail(org.springframework.http.HttpStatusCode.valueOf(error.status), error.getMessage());
        problem.setProperty("code", error.code); return problem;
    }
}
