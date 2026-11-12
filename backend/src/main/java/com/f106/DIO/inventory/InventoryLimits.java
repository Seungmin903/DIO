package com.f106.DIO.inventory;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import jakarta.persistence.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.json.JsonMapper;

/** Counts live inventory, not lifetime creations or storage objects. All writes use the caller's transaction. */
@Service @Transactional(propagation=Propagation.MANDATORY)
public class InventoryLimits {
 public enum Kind {
  PHOTO(200,"사진"),STICKER(200,"사용자 생성 스티커"),TAPE(5,"사용자 생성 테이프"),
  PERSONAL_DIARY(5,"개인 다이어리"),SHARED_DIARY(2,"참여 중인 공유 다이어리"),PAGE(150,"다이어리 페이지");
  public final int max;public final String label;
  Kind(int max,String label){this.max=max;this.label=label;}
 }
 private final JdbcTemplate jdbc;private final boolean postgres;
 private final JsonMapper json=JsonMapper.builder().build();
 @PersistenceContext private EntityManager entities;
 public InventoryLimits(JdbcTemplate jdbc){this.jdbc=jdbc;postgres=Boolean.TRUE.equals(jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Boolean>)c->"PostgreSQL".equals(c.getMetaData().getDatabaseProductName())));}
 private void flush(){if(!TransactionSynchronizationManager.isActualTransactionActive())throw new IllegalStateException("Inventory requires a transaction");entities.flush();}
 public void lock(long user){
  flush();
  if(postgres)jdbc.update("insert into inventory_quota_locks(user_id) values(?) on conflict(user_id) do nothing",user);
  else jdbc.update("merge into inventory_quota_locks(user_id) key(user_id) values(?)",user);
  jdbc.queryForObject("select user_id from inventory_quota_locks where user_id=? for update",Long.class,user);
 }
 public static Kind mediaKind(String category){try{return Kind.valueOf(category);}catch(IllegalArgumentException | NullPointerException e){return null;}}
 public static void capacity(Kind kind,long current,long additional){if(additional>0&&current+additional>kind.max)throw new InventoryLimitException(kind,current,additional);}
 public Set<String> mediaItems(long user,Kind kind){
  var ids=new HashSet<String>();
  var raw=jdbc.queryForList("select media_file_id from media_files where owner_user_id=? and media_type='IMAGE' and library_category=? and status='READY' and deleted_at is null and library_removed_at is null",UUID.class,user,kind.name());
  if(kind==Kind.PHOTO){raw.forEach(id->ids.add(id.toString()));return ids;}
  if(kind==Kind.STICKER){
   raw.forEach(id->ids.add(id.toString()));
   jdbc.queryForList("select media_file_id from user_sticker_library_media where user_id=?",UUID.class,user).forEach(id->ids.add(id.toString()));return ids;
  }
  var bound=new HashSet<>(jdbc.queryForList("select media_file_id from user_tape_library_media where user_id=?",UUID.class,user));
  raw.stream().filter(id->!bound.contains(id)).forEach(id->ids.add("upload:"+id));
  for(String doc:jdbc.queryForList("select document_json from user_tape_libraries where user_id=?",String.class,user))
   for(var folder:json.readTree(doc)){int position=0;for(var item:folder.path("items")){String id=item.path("id").asText(null);ids.add("item:"+(id==null?"legacy:"+folder.path("id").asText()+":"+position:id));position++;}}
  return ids;
 }
 private long pending(long user,Kind kind){return jdbc.queryForObject("select count(*) from inventory_media_reservations where user_id=? and kind=? and expires_at>?",Long.class,user,kind.name(),Timestamp.from(Instant.now()));}
 @Transactional(propagation=Propagation.REQUIRES_NEW)
 public UUID reserveMedia(long user,String category){
  Kind kind=mediaKind(category);if(kind==null)return null;
  lock(user);jdbc.update("delete from inventory_media_reservations where user_id=? and expires_at<=?",user,Timestamp.from(Instant.now()));
  capacity(kind,mediaItems(user,kind).size()+pending(user,kind),1);
  UUID id=UUID.randomUUID();jdbc.update("insert into inventory_media_reservations(reservation_id,user_id,kind,expires_at) values(?,?,?,?)",id,user,kind.name(),Timestamp.from(Instant.now().plus(Duration.ofMinutes(15))));return id;
 }
 @Transactional(propagation=Propagation.REQUIRES_NEW)
 public void releaseMedia(UUID reservation){if(reservation!=null)jdbc.update("delete from inventory_media_reservations where reservation_id=?",reservation);}
 public void completeMedia(long user,String category,UUID reservation){
  Kind kind=mediaKind(category);if(kind==null)return;
  lock(user);if(reservation!=null)jdbc.update("delete from inventory_media_reservations where reservation_id=?",reservation);
  // The media row has already been flushed, so include it once, not twice.
  long count=mediaItems(user,kind).size()+pending(user,kind);capacity(kind,count-1,1);
 }
 public void validateLibrary(long user,Kind kind,Set<String> previous){
  lock(user);var now=mediaItems(user,kind);
  if(now.size()+pending(user,kind)>kind.max&&!previous.containsAll(now))throw new InventoryLimitException(kind,previous.size(),Math.max(1,now.size()-previous.size()));
 }
 public void releaseLibraryMedia(long user,String category,Set<UUID> removed){
  for(UUID id:removed)jdbc.update("update media_files set library_removed_at=coalesce(library_removed_at,?) where media_file_id=? and owner_user_id=? and library_category=?",Timestamp.from(Instant.now()),id,user,category);
 }
 private static final String SHARED="(d.inventory_shared=true or d.visibility='MEMBERS' or (select count(*) from diary_members a where a.diary_id=d.diary_id and a.left_at is null)>1)";
 public boolean shared(UUID id){flush();return jdbc.queryForObject("select "+SHARED+" from diaries d where d.diary_id=?",Boolean.class,id);}
 public long diaries(long user,boolean shared){
  return jdbc.queryForObject("select count(*) from diaries d where d.deleted_at is null and "+(shared?SHARED:"not "+SHARED)+" and (d.owner_user_id=? or exists(select 1 from diary_members m where m.diary_id=d.diary_id and m.user_id=? and m.left_at is null))",Long.class,user,user);
 }
 public void createdDiary(long user,boolean shared){lock(user);Kind kind=shared?Kind.SHARED_DIARY:Kind.PERSONAL_DIARY;capacity(kind,diaries(user,shared)-1,1);}
 public List<Long> participants(UUID diary){
  return jdbc.queryForList("select owner_user_id from diaries where diary_id=? and owner_user_id is not null union select user_id from diary_members where diary_id=? and left_at is null order by 1",Long.class,diary,diary);
 }
 public void sharedDiaryChanged(UUID diary,boolean previouslyShared,Long joined){
  flush();var users=participants(diary);for(long user:users)if(!previouslyShared||Objects.equals(joined,user))lock(user);
  for(long user:users)if(!previouslyShared||Objects.equals(joined,user))capacity(Kind.SHARED_DIARY,diaries(user,true)-1,1);
 }
 public void restoredDiary(UUID diary,boolean shared){
  flush();var users=shared?participants(diary):jdbc.queryForList("select owner_user_id from diaries where diary_id=?",Long.class,diary);
  for(long user:users)lock(user);
  for(long user:users)capacity(shared?Kind.SHARED_DIARY:Kind.PERSONAL_DIARY,diaries(user,shared)-1,1);
 }
 public void pages(UUID diary,int added){
  flush();jdbc.queryForObject("select diary_id from diaries where diary_id=? for update",UUID.class,diary);
  long current=jdbc.queryForObject("select count(*) from pages where diary_id=? and deleted_at is null",Long.class,diary);
  capacity(Kind.PAGE,current,added);
 }
}
