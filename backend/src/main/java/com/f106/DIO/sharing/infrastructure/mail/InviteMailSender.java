package com.f106.DIO.sharing.infrastructure.mail;
public interface InviteMailSender {
    void configured();
    void send(String email,String diaryTitle,String inviteUrl);
}
