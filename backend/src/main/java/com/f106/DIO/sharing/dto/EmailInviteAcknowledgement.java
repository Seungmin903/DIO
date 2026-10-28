package com.f106.DIO.sharing.dto;
public record EmailInviteAcknowledgement(String message) {
    public static EmailInviteAcknowledgement accepted(){return new EmailInviteAcknowledgement("가입된 이메일이라면 초대가 전달됩니다.");}
}
