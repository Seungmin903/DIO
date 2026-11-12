package com.f106.DIO.global.logging;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.PrintWriter;
import java.io.StringWriter;
import org.junit.jupiter.api.Test;

class RedactedThrowableTests {

	@Test
	void keepsClassNamesAndStackTraceWithoutMessages() {
		var cause = new IllegalStateException("Key (storage_key)=(media/image/2026/11/secret.png) already exists");
		var error = new RuntimeException("wrapper media/image/2026/11/secret.png", cause);

		var redacted = RedactedThrowable.of(error);
		var printed = new StringWriter();
		redacted.printStackTrace(new PrintWriter(printed));

		assertThat(printed.toString())
			.doesNotContain("secret.png")
			.contains("java.lang.RuntimeException")
			.contains("java.lang.IllegalStateException")
			.contains("RedactedThrowableTests.keepsClassNamesAndStackTraceWithoutMessages");
		assertThat(redacted.getStackTrace()).isEqualTo(error.getStackTrace());
		assertThat(redacted.getCause().getStackTrace()).isEqualTo(cause.getStackTrace());
	}

	@Test
	void stopsAtCyclicCause() {
		var first = new RuntimeException("first");
		var second = new RuntimeException("second", first);
		first.initCause(second);

		var redacted = RedactedThrowable.of(first);

		assertThat(redacted.getCause()).isNotNull();
		assertThat(redacted.getCause().getCause()).isNull();
	}
}
