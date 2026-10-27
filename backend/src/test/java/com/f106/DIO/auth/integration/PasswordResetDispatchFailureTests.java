package com.f106.DIO.auth.integration;

import com.f106.DIO.auth.infrastructure.mail.PasswordResetMailDispatch;
import com.f106.DIO.auth.infrastructure.mail.PasswordResetMailSender;
import com.f106.DIO.auth.service.PasswordResetDeliveryFailureTracker;
import java.time.Instant;
import java.util.concurrent.RejectedExecutionException;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.TaskExecutor;
import static org.mockito.Mockito.*;

class PasswordResetDispatchFailureTests {
    @Test void bothQueueRejectionAndSmtpFailureTrackExactIssuance() {
        var sender=mock(PasswordResetMailSender.class);
        var failures=mock(PasswordResetDeliveryFailureTracker.class);
        var event=new PasswordResetMailDispatch.Requested("member@example.com","123456","test-hash",Instant.now());
        TaskExecutor rejected=task->{throw new RejectedExecutionException();};
        new PasswordResetMailDispatch(sender,rejected,failures).dispatch(event);
        verifyNoInteractions(sender);
        verify(failures).failed(event.email(),event.codeHash(),event.issuedAt());
        reset(failures);
        doThrow(new IllegalStateException()).when(sender).send(event.email(),event.code());
        new PasswordResetMailDispatch(sender,Runnable::run,failures).dispatch(event);
        verify(failures).failed(event.email(),event.codeHash(),event.issuedAt());
    }
}
