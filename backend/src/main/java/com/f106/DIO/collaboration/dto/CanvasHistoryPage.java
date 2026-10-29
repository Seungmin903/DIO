package com.f106.DIO.collaboration.dto;
import java.util.List;
public record CanvasHistoryPage(List<CanvasHistoryItem> items,int page,int size,boolean hasNext,CanvasHistoryItem nextUndo,CanvasHistoryItem nextRedo){}
