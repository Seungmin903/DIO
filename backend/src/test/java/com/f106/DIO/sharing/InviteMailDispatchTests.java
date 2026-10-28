package com.f106.DIO.sharing;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.f106.DIO.sharing.infrastructure.mail.InviteMailDispatch;
import com.f106.DIO.sharing.infrastructure.mail.InviteMailSender;
import com.f106.DIO.sharing.service.InviteMailDeliveryState;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.core.task.TaskExecutor;
import org.springframework.core.task.TaskRejectedException;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class InviteMailDispatchTests {
    @Test void logsOnlyTheFailureStageAndExceptionTypeForDeliveryAndQueueFailures(){
        var logger=(Logger)LoggerFactory.getLogger(InviteMailDispatch.class);
        var logs=new ListAppender<ILoggingEvent>();logs.start();logger.addAppender(logs);
        try{
            var sender=mock(InviteMailSender.class);var state=mock(InviteMailDeliveryState.class);
            var request=new InviteMailDispatch.Requested(17L,"private@example.com","private diary","https://private.test/token");
            when(state.deliverable(17L)).thenReturn(true);
            doThrow(new IllegalStateException("private SMTP password")).when(sender).send(request.email(),request.title(),request.url());
            new InviteMailDispatch(sender,Runnable::run,state).dispatch(request);
            var executor=mock(TaskExecutor.class);
            doThrow(new TaskRejectedException("private queue detail")).when(executor).execute(any(Runnable.class));
            new InviteMailDispatch(sender,executor,state).dispatch(request);
            verify(state,times(2)).failed(17L);
            assertThat(logs.list).extracting(ILoggingEvent::getFormattedMessage)
                .contains("Invite email delivery failed: inviteId=17,stage=DELIVERY,errorType=IllegalStateException",
                    "Invite email delivery failed: inviteId=17,stage=QUEUE,errorType=TaskRejectedException");
            for(var event:logs.list){
                assertThat(event.getFormattedMessage()).doesNotContain("private",request.email(),request.title(),request.url());
                assertThat(event.getThrowableProxy()).isNull();
            }
        }finally{logger.detachAppender(logs);logs.stop();}
    }
}
