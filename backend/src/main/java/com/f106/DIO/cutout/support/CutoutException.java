package com.f106.DIO.cutout.support;

import org.springframework.http.HttpStatus;

public class CutoutException extends RuntimeException {
	private final HttpStatus status;
	private final String code;
	private CutoutException(HttpStatus status, String code, String message) {
		super(message); this.status = status; this.code = code;
	}
	/** 없는 ID, 다른 사용자의 ID, 만료된 사진을 구분하지 않는다. 앱은 사진을 다시 올리면 된다. */
	public static CutoutException expired() {
		return new CutoutException(HttpStatus.NOT_FOUND, "CUTOUT_EXPIRED", "사진 정보가 만료됐어요. 사진을 다시 올려 주세요.");
	}
	public static CutoutException invalidImage() {
		return new CutoutException(HttpStatus.BAD_REQUEST, "CUTOUT_INVALID_IMAGE", "사진을 읽을 수 없어요. 다른 사진을 골라 주세요.");
	}
	public static CutoutException unsupportedFormat() {
		return new CutoutException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "CUTOUT_UNSUPPORTED_FORMAT", "JPG·PNG·WebP 사진만 사용할 수 있어요.");
	}
	public static CutoutException imageTooLarge() {
		return new CutoutException(HttpStatus.PAYLOAD_TOO_LARGE, "CUTOUT_IMAGE_TOO_LARGE", "20MB·4천만 화소 이하 사진을 골라 주세요.");
	}
	public static CutoutException noInclude() {
		return new CutoutException(HttpStatus.UNPROCESSABLE_CONTENT, "CUTOUT_NO_INCLUDE", "스티커로 만들 대상을 먼저 칠해 주세요.");
	}
	public static CutoutException emptySelection() {
		return new CutoutException(HttpStatus.UNPROCESSABLE_CONTENT, "CUTOUT_EMPTY_SELECTION", "남은 영역이 없어요. 대상을 다시 칠해 주세요.");
	}
	public static CutoutException invalidSelection() {
		return new CutoutException(HttpStatus.BAD_REQUEST, "CUTOUT_INVALID_SELECTION", "선택 정보가 올바르지 않습니다.");
	}
	public static CutoutException busy() {
		return new CutoutException(HttpStatus.SERVICE_UNAVAILABLE, "CUTOUT_BUSY", "사진 분석 요청이 많아요. 잠시 후 다시 시도해 주세요.");
	}
	public static CutoutException unavailable() {
		return new CutoutException(HttpStatus.SERVICE_UNAVAILABLE, "CUTOUT_UNAVAILABLE", "지금은 사진 오리기를 쓸 수 없어요. 잠시 후 다시 시도해 주세요.");
	}
	public HttpStatus status() { return status; }
	public String code() { return code; }
}
