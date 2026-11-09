package com.f106.DIO.diary.support;

public class DiaryAccessDeniedException extends RuntimeException {
	public DiaryAccessDeniedException() {
		super("이 다이어리에 접근할 권한이 없어요.");
	}
}
