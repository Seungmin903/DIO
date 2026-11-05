package com.f106.DIO.moderation.service;
import com.f106.DIO.moderation.domain.*;import com.f106.DIO.moderation.dto.*;import com.f106.DIO.moderation.repository.*;import com.f106.DIO.moderation.exception.ModerationException;
import com.f106.DIO.sharing.service.SharingAccessService;
import com.f106.DIO.media.storage.*;import com.f106.DIO.media.domain.MediaType;
import java.util.*;import java.security.*;import java.nio.charset.StandardCharsets;
import org.springframework.stereotype.Service;import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;
@Service
public class ReportService {
 private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(ReportService.class);
 private final UserReportRepository reports;private final SharingAccessService access;private final ReportEvidence evidence;private final MediaFiles storage;private final String storageProvider;private final ObjectMapper json;private final JdbcTemplate jdbc;private final TransactionTemplate transactions;private final ReportSubmissionLimits limits;
 public ReportService(UserReportRepository reports,SharingAccessService access,ReportEvidence evidence,MediaFiles storage,ObjectMapper json,JdbcTemplate jdbc,TransactionTemplate transactions,ReportSubmissionLimits limits,@org.springframework.beans.factory.annotation.Value("${dio.media.storage:local}") String provider){this.storageProvider=provider.toUpperCase(java.util.Locale.ROOT);this.reports=reports;this.access=access;this.evidence=evidence;this.storage=storage;this.json=json;this.jdbc=jdbc;this.transactions=transactions;this.limits=limits;}
 public record Accepted(ReportResponse response,boolean created){}
 public Accepted submit(long actor,ReportRequest r,List<MultipartFile> files){
  if(r.reportedUserId()==actor)throw ModerationException.invalid("본인은 신고할 수 없어요.");
  String description=r.description()==null?null:r.description().strip();
  if(r.reasonCode()==ReportReason.OTHER&&(description==null||description.isBlank()))throw ModerationException.invalid("기타 사유를 설명해 주세요.");
  // This is deliberately an unlocked preflight. The authoritative check happens again in the short write transaction.
  access.readMember(access.read(r.diaryId()),actor);
  limits.reserveAttempt(actor,java.time.Instant.now());
  if(reports.findByReporterUserIdAndClientRequestId(actor,r.clientRequestId()).isEmpty())
   limits.checkAccepted(actor,r.reportedUserId(),java.time.Instant.now());
  var images=evidence.prepare(files);String hash=hash(r,description,images);
  var keys=new ArrayList<String>();var metadata=new ArrayList<Map<String,Object>>();
  try{
   // Storage work is intentionally outside the diary lock. A rejected write is compensated below.
   for(var image:images){
    String key=MediaStorageKeys.create(MediaType.IMAGE,image.extension(),UUID.randomUUID());keys.add(key);storage.put(key,image.stored(),image.mime());
    metadata.add(Map.of("storageKey",key,"provider",storageProvider,"mimeType",image.mime(),"size",image.stored().length));
   }
   var accepted=transactions.execute(status->{
    var diary=access.lock(r.diaryId());access.readMember(diary,actor);
    // Serialize client request IDs only while checking/persisting the report, never while decoding or uploading.
    jdbc.queryForList("select user_id from users where user_id=? for update",actor);
    var previous=reports.findByReporterUserIdAndClientRequestId(actor,r.clientRequestId()).orElse(null);
    if(previous!=null){
     if(!previous.getRequestHash().equals(hash))throw new ModerationException(org.springframework.http.HttpStatus.CONFLICT,"REPORT_REQUEST_CONFLICT","같은 요청 번호로 다른 신고를 보낼 수 없어요.");
     return new Accepted(ReportResponse.of(previous),false);
    }
    if(access.visibleMembers(diary).stream().noneMatch(m->m.getUserId().equals(r.reportedUserId())))throw ModerationException.missing();
    limits.checkAccepted(actor,r.reportedUserId(),java.time.Instant.now());
    var saved=reports.saveAndFlush(new UserReport(actor,r.reportedUserId(),r.diaryId(),r.clientRequestId(),hash,r.reasonCode(),description,json.writeValueAsString(metadata)));
    return new Accepted(ReportResponse.of(saved),true);
   });
   if(accepted==null)throw new IllegalStateException("Report transaction did not complete");
   if(!accepted.created())deleteAll(keys,"duplicate cleanup");
   return accepted;
  }catch(RuntimeException e){deleteAll(keys,"rollback cleanup");throw e;}
 }
 private void deleteAll(List<String> keys,String context){for(String key:keys)try{storage.delete(key);}catch(RuntimeException e){LOG.warn("Report evidence {} failed: type={}",context,e.getClass().getSimpleName());}}
 private String hash(ReportRequest r,String description,List<ReportEvidence.Image> images){
  try{var digest=MessageDigest.getInstance("SHA-256");digest.update(json.writeValueAsString(Arrays.asList(r.reportedUserId(),r.diaryId(),r.reasonCode(),description)).getBytes(StandardCharsets.UTF_8));
   for(var image:images){digest.update(MessageDigest.getInstance("SHA-256").digest(image.original()));}return HexFormat.of().formatHex(digest.digest());
  }catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}
 }
}
