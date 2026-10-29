package com.f106.DIO.collaboration.dto;
import java.util.List;
import com.f106.DIO.page.dto.CanvasElementData;
public record CanvasOperationResponse(String operationId,String clientOperationId,String status,int revision,boolean replayed,List<CanvasElementData> items){}
