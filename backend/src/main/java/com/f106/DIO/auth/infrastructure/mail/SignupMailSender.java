package com.f106.DIO.auth.infrastructure.mail;
public interface SignupMailSender {
    public void send(String email, String code);
}
