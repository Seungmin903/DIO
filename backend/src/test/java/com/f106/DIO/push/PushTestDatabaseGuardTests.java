package com.f106.DIO.push;

import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class PushTestDatabaseGuardTests {
    private Map<String,String> valid() {
        return new HashMap<>(Map.of("DIO_PUSH_TEST_DISPOSABLE","true", "DIO_PUSH_URL","jdbc:postgresql://127.0.0.1:5432/pushqa_012345abcdef", "DIO_PUSH_PASSWORD","test-only", "DIO_PUSH_GUARD","0123456789abcdef0123456789abcdef"));
    }
    @Test void acceptsOnlyExplicitLoopbackDisposableUrl() {
        var env=valid();assertThat(PushTestDatabaseGuard.validatedUrl(env)).endsWith("pushqa_012345abcdef");
        for(String url:List.of("jdbc:postgresql://db:5432/pushqa_012345abcdef","jdbc:postgresql://localhost:5432/pushqa_012345abcdef","jdbc:postgresql://127.0.0.1:5432/production","jdbc:postgresql://127.0.0.1:5432/pushqa_012345abcdef?host=db")) {
            env.put("DIO_PUSH_URL",url);assertThatThrownBy(()->PushTestDatabaseGuard.validatedUrl(env)).isInstanceOf(IllegalStateException.class);
        }
    }
    @Test void rejectsMissingExplicitFlagOrMarker() {
        var env=valid();env.remove("DIO_PUSH_TEST_DISPOSABLE");assertThatThrownBy(()->PushTestDatabaseGuard.validatedUrl(env)).isInstanceOf(IllegalStateException.class);
        var missing=valid();missing.remove("DIO_PUSH_GUARD");assertThatThrownBy(()->PushTestDatabaseGuard.validatedUrl(missing)).isInstanceOf(IllegalStateException.class);
    }
}
