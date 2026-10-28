package com.f106.DIO.sharing.infrastructure.mail;
import com.f106.DIO.auth.config.SignupProperties;
import com.f106.DIO.sharing.exception.SharingException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
@Component
public class SmtpInviteMailSender implements InviteMailSender {
    private final ObjectProvider<JavaMailSender> sender;private final SignupProperties properties;
    public SmtpInviteMailSender(ObjectProvider<JavaMailSender> sender,SignupProperties properties){this.sender=sender;this.properties=properties;}
    public void configured(){if(sender.getIfAvailable()==null||properties.mailFrom().isBlank())throw new SharingException(HttpStatus.SERVICE_UNAVAILABLE,"INVITE_MAIL_UNAVAILABLE","초대 메일 서버 설정을 확인해 주세요.");}
    public void send(String email,String title,String url){
        configured();var message=new SimpleMailMessage();message.setFrom(properties.mailFrom());message.setTo(email);
        message.setSubject("[DIO] 다이어리 초대");
        message.setText("‘"+title+"’ 다이어리에 초대받았어요.\n초대받은 이메일의 DIO 계정으로 로그인한 뒤 참여해 주세요.\n"+url+"\n이메일 초대는 수락·거절·취소 전까지 유지됩니다.");
        sender.getObject().send(message);
    }
}
