package com.f106.DIO.collaboration.dto;
import java.time.Instant;
public record CanvasHistoryItem(String operationId,String clientOperationId,String operationType,String status,int revision,Instant createdAt,Instant undoneAt){}
