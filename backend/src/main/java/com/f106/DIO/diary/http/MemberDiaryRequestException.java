package com.f106.DIO.diary.http;

final class MemberDiaryRequestException extends RuntimeException {
    final String code;
    MemberDiaryRequestException(String code) { this.code=code; }
}
