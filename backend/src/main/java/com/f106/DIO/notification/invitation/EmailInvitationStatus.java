package com.f106.DIO.notification.invitation;

/** 이메일 초대 상태 매핑. 7일 만료는 조회 쿼리에서 열 수 있는지(canOpen)로만 반영한다. */
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
