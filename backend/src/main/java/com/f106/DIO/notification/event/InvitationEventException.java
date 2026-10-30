package com.f106.DIO.notification.event;

/** 호출자는 성공 커밋 후 ACK, 일시 오류는 재시도, 잘못된 이벤트는 별도 오류 큐로 처리한다. */
public class InvitationEventException extends RuntimeException {

	private final boolean retryable;

	public InvitationEventException(String message, boolean retryable) {
		super(message);
		this.retryable = retryable;
	}

	public boolean retryable() { return retryable; }
}
