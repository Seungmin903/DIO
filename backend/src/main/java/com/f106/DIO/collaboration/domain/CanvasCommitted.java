package com.f106.DIO.collaboration.domain;
import java.util.UUID;
public record CanvasCommitted(UUID diaryId,UUID pageId,String operationId,UUID clientOperationId,long actorUserId,int revision,String action){}
