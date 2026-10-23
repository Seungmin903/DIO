package com.f106.DIO.diary.support;

public class InvalidDiaryFormatException extends RuntimeException {

	public InvalidDiaryFormatException() {
		super("지원하지 않는 다이어리 규격 ID입니다.");
	}
}
