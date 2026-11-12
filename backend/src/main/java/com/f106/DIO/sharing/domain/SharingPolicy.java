package com.f106.DIO.sharing.domain;
public final class SharingPolicy {
    private SharingPolicy() {}
    public static final int MAX_MEMBERS=4, INVITE_TTL_SECONDS=3600, INVITE_WINDOW_SECONDS=300, MAX_INVITES=3;
    /** Pending email invitations are personal data and must not be retained indefinitely. */
    public static final int EMAIL_INVITE_TTL_SECONDS=7*24*60*60;
}
