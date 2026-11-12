package com.f106.DIO.inventory;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@org.springframework.core.annotation.Order(org.springframework.core.Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice
public class InventoryExceptionHandler {
 @ExceptionHandler(InventoryLimitException.class)
 public ProblemDetail limited(InventoryLimitException error){
  var problem=ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,error.getMessage());
  problem.setProperty("code","INVENTORY_LIMIT_REACHED");problem.setProperty("limitType",error.kind);
  problem.setProperty("currentCount",error.current);problem.setProperty("maxCount",error.max);problem.setProperty("requestedCount",error.requested);
  return problem;
 }
}
