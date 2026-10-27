package com.f106.DIO.auth.signup;
public interface SignupMailSender {
    void send(String email, String code);
}
