package com.f106.DIO.notification.invitation;

/** 이메일은 무기한이다. LINK의 만료 시각을 이메일 판정에 적용하지 않는다. */
final class EmailInvitationStatus {
    private EmailInvitationStatus() {}
    static String map(String type, boolean revoked, int uses) {
        return switch (type) {
            case "EMAIL_ACCEPTED" -> "ACCEPTED";
            case "EMAIL_DECLINED" -> "DECLINED";
            case "EMAIL_CANCELLED" -> "CANCELLED";
            case "EMAIL_FAILED" -> "DELIVERY_FAILED";
            case "EMAIL" -> revoked ? "CANCELLED" : uses == 0 ? "PENDING" : "ACCEPTED";
            default -> null;
        };
    }
}
