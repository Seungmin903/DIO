# 회원 다이어리 사용량 조회

다이어리·속지 개수 제한 안내에 쓰도록, 내가 참여 중인 모든 다이어리의 속지 수와 요소 수를 한 번에 돌려준다. 제한 자체(생성 차단)는 이 API의 범위가 아니다.

## API

`GET /api/v1/member/diaries/usage` (Bearer 토큰, 본문·쿼리 없음, `Cache-Control: no-store`)

```json
{
  "diaryCount": 2,
  "diaries": [
    { "diaryId": "…", "owned": true,  "pageCount": 12, "elementCount": 340 },
    { "diaryId": "…", "owned": false, "pageCount": 5,  "elementCount": 41 }
  ]
}
```

- 범위는 회원 다이어리 목록(`GET /api/v1/member/diaries`)과 같다. 내 다이어리(OWNER)와 참여 중인 공유 다이어리(EDITOR)를 모두 센다. 나간 다이어리는 세지 않는다.
- 목록과 달리 페이지로 나누지 않고 전부 돌려준다. 순서는 다이어리 생성 순.
- `owned`: 내가 OWNER인지. 제한을 소유한 다이어리만 셀 때 쓴다.
- `pageCount`: 삭제 안 된 속지(페이지) 수.
- `elementCount`: 삭제 안 된 속지 위의 삭제 안 된 캔버스 요소 수.
- 휴지통(30일 보관 중)에 있는 다이어리는 세지 않는다.
- 토큰이 없거나 만료되면 401 `INVALID_TOKEN`.

## 구현

- `MemberDiaryUsageQuery`, `MemberDiaryController#usage`
- 테스트: `MemberDiaryUsageHttpTests` (내 다이어리·공유 참여·비참여·휴지통·지운 속지/요소·나가기·빈 계정·토큰 없음)
