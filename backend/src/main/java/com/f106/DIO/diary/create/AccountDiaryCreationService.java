package com.f106.DIO.diary.create;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.f106.DIO.diary.read.*;
import io.swagger.v3.oas.annotations.media.Schema;

@Service
public class AccountDiaryCreationService {
    private final JdbcTemplate jdbc;
    private final FirstDiaryPageWriter pages;
    private final DiaryReadService reads;
    private final tools.jackson.databind.json.JsonMapper json=tools.jackson.databind.json.JsonMapper.builder().build();
    public AccountDiaryCreationService(JdbcTemplate jdbc,FirstDiaryPageWriter pages,DiaryReadService reads) {
        this.jdbc=jdbc;this.pages=pages;this.reads=reads;
    }
    @Schema(requiredProperties={"diary","firstPageId"})
    public record Created(DiaryReadDtos.Item diary,String firstPageId) {}
    public record Result(UUID diaryId,String body) {}
    private record Receipt(String hash,UUID diary,String body,Instant expires) {}

    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public Result create(long user,String key,AccountDiaryCreateRequest input) {
        UUID requestKey;
        try { requestKey=UUID.fromString(key); if(!requestKey.toString().equalsIgnoreCase(key))throw new IllegalArgumentException(); }
        catch(RuntimeException error) { throw new DiaryReadException(400,"INVALID_IDEMPOTENCY_KEY","요청 키를 확인해 주세요."); }
        String hash=fingerprint(json.writeValueAsString(input));
        // PostgreSQL READ COMMITTED: after this lock the receipt query sees the preceding committed request.
        // Serialize per account, including distinct keys, without JVM-local locks or process affinity.
        var account=jdbc.queryForList("select user_id from users where user_id=? and deleted_at is null for update",Long.class,user);
        if(account.isEmpty())throw new DiaryReadException(401,"AUTHENTICATION_REQUIRED","다시 로그인해 주세요.");
        Instant now=Instant.now().truncatedTo(ChronoUnit.MICROS);
        var receipts=jdbc.query("select request_hash,diary_id,response_body,expires_at from diary_creation_requests where user_id=? and request_key=?",
            (rs,i)->new Receipt(rs.getString(1).strip(),rs.getObject(2,UUID.class),rs.getString(3),rs.getTimestamp(4).toInstant()),user,requestKey);
        if(!receipts.isEmpty()) {
            var receipt=receipts.get(0);
            if(!now.isBefore(receipt.expires()))throw conflict("IDEMPOTENCY_KEY_EXPIRED","이 요청의 확인 기한이 지났어요. 목록에서 생성 여부를 확인해 주세요.");
            if(!receipt.hash().equals(hash))throw conflict("IDEMPOTENCY_KEY_CONFLICT","같은 요청 키로 다른 내용을 만들 수 없어요.");
            try {
                if(!reads.detail(user,receipt.diary().toString()).diary().myRole().equals("OWNER"))throw conflict("CREATED_DIARY_UNAVAILABLE","생성한 다이어리를 현재 조회할 수 없어요.");
            } catch(DiaryReadException error) { throw conflict("CREATED_DIARY_UNAVAILABLE","생성한 다이어리를 현재 조회할 수 없어요."); }
            if(receipt.body()==null)throw conflict("IDEMPOTENCY_KEY_EXPIRED","목록에서 생성 여부를 확인해 주세요.");
            return new Result(receipt.diary(),receipt.body());
        }
        UUID diary=UUID.randomUUID();
        jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility,created_at,updated_at) values(?,?,?,?,?,'PRIVATE',?,?)",
            diary,user,input.diaryTitle(),input.coverColor(),input.coverStyle(),Timestamp.from(now),Timestamp.from(now));
        UUID page=pages.insert(diary,input.firstPage(),now);
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color,is_favorite,joined_at) values(?,?,'OWNER','#CED9EE',false,?)",diary,user,Timestamp.from(now));
        String body=json.writeValueAsString(new Created(reads.detail(user,diary.toString()).diary(),page.toString()));
        jdbc.update("insert into diary_creation_requests(user_id,request_key,request_hash,diary_id,response_body,created_at,expires_at) values(?,?,?,?,?,?,?)",
            user,requestKey,hash,diary,body,Timestamp.from(now),Timestamp.from(now.plus(24,ChronoUnit.HOURS)));
        return new Result(diary,body);
    }
    @Transactional
    public int purgeExpiredResponses() {
        return jdbc.update("update diary_creation_requests set response_body=null where (user_id,request_key) in "
            +"(select user_id,request_key from diary_creation_requests where response_body is not null and expires_at<=current_timestamp order by expires_at limit 500)");
    }
    private static DiaryReadException conflict(String code,String message){return new DiaryReadException(409,code,message);}
    private static String fingerprint(String value) {
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}
        catch(java.security.NoSuchAlgorithmException error){throw new IllegalStateException(error);}
    }
}
