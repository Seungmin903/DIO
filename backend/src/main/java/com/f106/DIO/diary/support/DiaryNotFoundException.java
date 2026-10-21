package com.f106.DIO.diary.support;

public class DiaryNotFoundException extends RuntimeException {

	public DiaryNotFoundException() {
		super("다이어리를 찾을 수 없습니다.");
	}
}
