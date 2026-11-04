package com.f106.DIO.moderation.exception;
import com.f106.DIO.sharing.exception.SharingException;import org.springframework.http.*;import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.context.request.WebRequest;
@RestControllerAdvice(basePackages="com.f106.DIO.moderation.controller")
public class ModerationExceptionHandler extends ResponseEntityExceptionHandler {
 @ExceptionHandler(ModerationException.class) public ResponseEntity<ProblemDetail> moderation(ModerationException e){
  var response=problem(e.status,e.code,e.getMessage());var headers=new HttpHeaders();headers.putAll(response.getHeaders());
  if(e.retryAfter!=null)headers.set(HttpHeaders.RETRY_AFTER,Long.toString(e.retryAfter));
  return new ResponseEntity<>(response.getBody(),headers,e.status);
 }
 @ExceptionHandler(SharingException.class) public ResponseEntity<ProblemDetail> sharing(SharingException e){return problem(e.status,e.code,e.getMessage());}
 @ExceptionHandler(com.f106.DIO.media.storage.MediaStorageException.class) public ResponseEntity<ProblemDetail> storage(com.f106.DIO.media.storage.MediaStorageException e){return problem(e.status(),e.code(),e.getMessage());}
 private ResponseEntity<ProblemDetail> problem(HttpStatus status,String code,String message){var p=ProblemDetail.forStatusAndDetail(status,message);p.setProperty("code",code);return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(p);}
 @Override protected ResponseEntity<Object> handleExceptionInternal(Exception e,Object body,HttpHeaders headers,HttpStatusCode status,WebRequest request){var copy=new HttpHeaders();copy.putAll(headers);copy.setCacheControl("no-store");return super.handleExceptionInternal(e,body,copy,status,request);}
}
