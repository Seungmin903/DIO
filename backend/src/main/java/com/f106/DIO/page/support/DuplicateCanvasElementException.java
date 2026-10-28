package com.f106.DIO.page.support;

public class DuplicateCanvasElementException extends RuntimeException {
	public DuplicateCanvasElementException() { super("이미 존재하는 요소 ID입니다."); }
}
