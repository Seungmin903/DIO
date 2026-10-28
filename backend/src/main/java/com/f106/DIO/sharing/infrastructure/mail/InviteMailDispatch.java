package com.f106.DIO.sharing.infrastructure.mail;
import com.f106.DIO.sharing.service.InviteMailDeliveryState;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.*;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.*;
@Component
public class InviteMailDispatch {
    public record Requested(long inviteId,String email,String title,String url){
        @Override public String toString(){return "InviteMailRequested[id="+inviteId+",privateFields=REDACTED]";}
    }
    private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(InviteMailDispatch.class);
    private final InviteMailSender sender;private final TaskExecutor executor;private final InviteMailDeliveryState state;
    public InviteMailDispatch(InviteMailSender sender,@Qualifier("sharingInviteMailExecutor") TaskExecutor executor,InviteMailDeliveryState state){this.sender=sender;this.executor=executor;this.state=state;}
    @org.springframework.context.event.EventListener
    public void dispatch(Requested request){
        try{executor.execute(()->{try{if(state.deliverable(request.inviteId()))sender.send(request.email(),request.title(),request.url());}
            catch(RuntimeException error){failed(request.inviteId());}});}catch(RuntimeException error){failed(request.inviteId());}
    }
    private void failed(long id){
        LOG.warn("Invite email delivery failed: inviteId={}",id);
        try{state.failed(id);}catch(RuntimeException error){LOG.warn("Invite delivery failure state update failed: inviteId={},errorType={}",id,error.getClass().getSimpleName());}
    }
    @Configuration(proxyBeanMethods=false)
    static class ExecutorConfig {
        @Bean(name="sharingInviteMailExecutor",defaultCandidate=false)
        ThreadPoolTaskExecutor sharingInviteMailExecutor(){
            var executor=new ThreadPoolTaskExecutor();executor.setCorePoolSize(1);executor.setMaxPoolSize(2);executor.setQueueCapacity(100);
            executor.setThreadNamePrefix("sharing-invite-mail-");return executor;
        }
    }
}
