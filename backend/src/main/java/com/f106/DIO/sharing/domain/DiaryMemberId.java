package com.f106.DIO.sharing.domain;
import java.io.Serializable;
import java.util.UUID;
@lombok.Getter @lombok.EqualsAndHashCode
public class DiaryMemberId implements Serializable {
    private UUID diaryId;
    private Long userId;
    public DiaryMemberId() {}
    public DiaryMemberId(UUID diaryId,Long userId) {this.diaryId=diaryId;this.userId=userId;}
}
