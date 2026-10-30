package com.f106.DIO.font;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.f106.DIO.diary.auth.DiaryRequestIdentity;
import com.f106.DIO.diary.detail.DiaryDetailException;
import com.f106.DIO.diary.detail.DiaryDetailRepository;
import com.f106.DIO.diary.detail.DiaryMembershipAccess;

@Service
@Transactional
public class FontService {
    private final JdbcTemplate jdbc;
    private final DiaryRequestIdentity identity;
    private final DiaryDetailRepository diaries;
    private final DiaryMembershipAccess members;
    private final FontFileReader files;
    public FontService(JdbcTemplate jdbc, DiaryRequestIdentity identity, DiaryDetailRepository diaries, DiaryMembershipAccess members, FontFileReader files) {
        this.jdbc=jdbc; this.identity=identity; this.diaries=diaries; this.members=members; this.files=files;
    }
    public record Font(UUID mediaFileId, String name, String mimeType, long fileSize, boolean enabled) {}
    public record Download(byte[] content, String mimeType) {}
    public Download download(UUID diaryId, UUID fileId) {
        authorize(diaryId,false);
        // Keep user -> diary -> membership -> media locks through the bounded storage read.
        var rows=jdbc.query("select f.storage_key,f.file_size from media_files f where f.media_file_id=? and f.media_type='FONT' and f.status='READY' and f.deleted_at is null for update",
            (rs,n)->new Object[]{rs.getString(1),rs.getLong(2)},fileId);
        if(rows.isEmpty() || jdbc.queryForList("select font_media_file_id from diary_handwriting_fonts where diary_id=? and font_media_file_id=? and is_enabled=true for update",UUID.class,diaryId,fileId).isEmpty()) throw missing();
        long size=(Long)rows.get(0)[1];
        if(size<=0 || size>25*1024*1024) throw missing();
        byte[] content=files.read((String)rows.get(0)[0]);
        if(content==null || content.length!=size || content.length<12) throw missing();
        int signature=java.nio.ByteBuffer.wrap(content).getInt();
        String mime=switch(signature) {
            case 0x00010000,0x74727565 -> "font/ttf";
            case 0x4f54544f -> "font/otf";
            case 0x774f4646 -> "font/woff";
            case 0x774f4632 -> "font/woff2";
            default -> throw missing();
        };
        return new Download(content,mime);
    }
    private long user() {
        long id=identity.requireUserId(DiaryDetailException::unauthorized);
        if(!diaries.lockActiveUser(id)) throw DiaryDetailException.unauthorized();
        return id;
    }
    private long authorize(UUID diaryId, boolean writing) {
        long id=user();
        var diary=diaries.lock(diaryId,writing).orElseThrow(DiaryDetailException::notFound);
        if(diary.deletedAt()!=null) throw DiaryDetailException.notFound();
        members.requireActiveRole(id,diaryId,diary.ownerUserId());
        return id;
    }
    public List<Font> mine() {
        return jdbc.query("select media_file_id,original_filename,mime_type,file_size from media_files where owner_user_id=? and media_type='FONT' and status='READY' and deleted_at is null order by created_at desc,media_file_id",
            (rs,n)->new Font(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),rs.getLong(4),true),user());
    }
    public List<Font> list(UUID diaryId) {
        authorize(diaryId,false);
        return jdbc.query("select f.media_file_id,f.original_filename,f.mime_type,f.file_size,d.is_enabled from diary_handwriting_fonts d join media_files f on f.media_file_id=d.font_media_file_id where d.diary_id=? and f.media_type='FONT' and f.status='READY' and f.deleted_at is null order by d.created_at,f.media_file_id",
            (rs,n)->new Font(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),rs.getLong(4),rs.getBoolean(5)),diaryId);
    }
    public void share(UUID diaryId, UUID fileId) {
        long id=authorize(diaryId,true);
        if(jdbc.queryForList("select media_file_id from media_files where media_file_id=? and owner_user_id=? and media_type='FONT' and status='READY' and deleted_at is null for update",UUID.class,fileId,id).isEmpty()) throw missing();
        if(jdbc.queryForList("select font_media_file_id from diary_handwriting_fonts where diary_id=? and font_media_file_id=?",UUID.class,diaryId,fileId).isEmpty())
            jdbc.update("insert into diary_handwriting_fonts(diary_id,font_media_file_id,granted_by_user_id,is_enabled) values(?,?,?,true)",diaryId,fileId,id);
    }
    public void setEnabled(UUID diaryId, UUID fileId, boolean enabled) {
        authorize(diaryId,true);
        // Match share's diary -> media lock order and serialize media deletion with validation.
        if(jdbc.queryForList("select media_file_id from media_files where media_file_id=? and media_type='FONT' and status='READY' and deleted_at is null for update",UUID.class,fileId).isEmpty()) throw missing();
        int changed=jdbc.update("update diary_handwriting_fonts d set is_enabled=?,disabled_at=case when ? then null else coalesce(d.disabled_at,current_timestamp) end where d.diary_id=? and d.font_media_file_id=?",enabled,enabled,diaryId,fileId);
        if(changed==0) throw missing();
    }
    private static DiaryDetailException missing() { return new DiaryDetailException(HttpStatus.NOT_FOUND,"FONT_NOT_FOUND","폰트를 찾을 수 없습니다."); }
}
