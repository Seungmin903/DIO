package com.f106.DIO.auth.reset;

public interface PasswordResetMailSender {
    void send(String email, String code);
}
