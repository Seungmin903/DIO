package com.f106.DIO.global.logging;

import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;

/**
 * 예외 메시지를 빼고 클래스 이름과 스택 트레이스만 남긴 사본. 로그에 원인 위치는 남기되,
 * DB 제약 위반 등 메시지에 들어갈 수 있는 저장소 키·사용자 값은 남기지 않을 때 쓴다.
 */
public final class RedactedThrowable extends RuntimeException {
	private RedactedThrowable(Throwable source, Set<Throwable> seen) {
		super(source.getClass().getName(), redactCause(source.getCause(), seen), false, true);
		setStackTrace(source.getStackTrace());
	}

	public static RedactedThrowable of(Throwable source) {
		Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
		seen.add(source);
		return new RedactedThrowable(source, seen);
	}

	private static RedactedThrowable redactCause(Throwable cause, Set<Throwable> seen) {
		if (cause == null || !seen.add(cause)) return null;
		return new RedactedThrowable(cause, seen);
	}
}
