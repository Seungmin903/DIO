package com.f106.DIO.inventory;

public class InventoryLimitException extends RuntimeException {
 public final String kind; public final long current,max,requested;
 public InventoryLimitException(InventoryLimits.Kind kind,long current,long requested){
  super(kind.label+"은(는) "+kind.max+"개까지 보유할 수 있어요. 기존 항목을 삭제한 뒤 다시 시도해 주세요.");
  this.kind=kind.name();this.current=current;this.max=kind.max;this.requested=requested;
 }
}
