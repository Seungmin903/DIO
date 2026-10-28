package com.f106.DIO.auth.infrastructure.mail;



public interface PasswordResetMailSender {
    public void send(String email, String code);
}
