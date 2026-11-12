package com.f106.DIO.user.domain;
public enum TermsType {
    SERVICE, PRIVACY, MARKETING, MARKETING_PRIVACY, AD_EMAIL, AD_PUSH, AD_NIGHT_PUSH;
    public boolean required() { return this == SERVICE || this == PRIVACY; }
}
