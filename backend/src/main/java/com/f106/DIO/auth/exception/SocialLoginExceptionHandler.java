package com.f106.DIO.auth.exception;
import com.f106.DIO.auth.controller.SocialLoginController;
import com.f106.DIO.auth.controller.MyProfileController;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
@RestControllerAdvice(assignableTypes={SocialLoginController.class,MyProfileController.class})
public class SocialLoginExceptionHandler extends ResponseEntityExceptionHandler {
 @ExceptionHandler(SocialLoginException.class) public ResponseEntity<ProblemDetail> social(SocialLoginException error){return problem(error.status,error.code,error.getMessage());}
 @ExceptionHandler(LoginException.class) public ResponseEntity<ProblemDetail> login(LoginException error){var response=problem(error.status,error.code,error.getMessage());if(error.status==HttpStatus.TOO_MANY_REQUESTS)return ResponseEntity.status(error.status).header("Cache-Control","no-store").header("Retry-After","900").body(response.getBody());return response;}
 private ResponseEntity<ProblemDetail> problem(HttpStatus status,String code,String message){var detail=ProblemDetail.forStatusAndDetail(status,message);detail.setProperty("code",code);return ResponseEntity.status(status).header("Cache-Control","no-store").body(detail);}
 @Override protected ResponseEntity<Object> createResponseEntity(Object body,HttpHeaders headers,HttpStatusCode status,WebRequest request){var next=new HttpHeaders();next.putAll(headers);next.setCacheControl("no-store");return new ResponseEntity<>(body,next,status);}
}
