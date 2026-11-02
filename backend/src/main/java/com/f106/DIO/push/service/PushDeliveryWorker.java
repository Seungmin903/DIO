package com.f106.DIO.push.service;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** 대기열 분배와 발송을 수행한다. 기본 비활성이고 발송 결과는 전달 보장이 아닌 Expo 접수 상태다. */
@Service
public class PushDeliveryWorker {
 private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(PushDeliveryWorker.class);
 private final JdbcTemplate jdbc; private final TransactionTemplate tx; private final PushInstallationService installations;
 private final ExpoPushGateway gateway; private final boolean enabled;
 public PushDeliveryWorker(JdbcTemplate jdbc,org.springframework.transaction.PlatformTransactionManager manager,PushInstallationService installations,ExpoPushGateway gateway,@Value("${dio.push.delivery.enabled:false}") boolean enabled){this.jdbc=jdbc;this.tx=new TransactionTemplate(manager);this.installations=installations;this.gateway=gateway;this.enabled=enabled;}
 @Scheduled(fixedDelayString="${dio.push.delivery.poll-ms:30000}", scheduler="pushDeliveryScheduler")
 public void poll(){if(!enabled)return;var skipped=new java.util.HashSet<UUID>();for(int i=0;i<25;i++){UUID[] selected={null};try{if(!Boolean.TRUE.equals(tx.execute(st->fanOutOne(skipped,selected))))break;}catch(Exception error){log.warn("푸시 분배 실패 outbox={} type={}",selected[0],error.getClass().getSimpleName());if(selected[0]==null || Thread.currentThread().isInterrupted())break;skipped.add(selected[0]);}} for(int i=0;i<100;i++){var item=next();if(item==null)break;try{tx.executeWithoutResult(st->deliver(item));}catch(Exception error){if(!deferAfterFailure(item,error,false))break;}} for(int i=0;i<100;i++){var receipt=nextReceipt();if(receipt==null)break;try{tx.executeWithoutResult(st->checkReceipt(receipt));}catch(Exception error){if(!deferAfterFailure(receipt,error,true))break;}}}
 private boolean deferAfterFailure(Item item,Exception error,boolean receipt){
  log.warn("푸시 처리 실패 outbox={} type={}",item.outbox(),error.getClass().getSimpleName());
  if(Thread.currentThread().isInterrupted())return false;
  try {tx.executeWithoutResult(st->{
   if(receipt)jdbc.update("update push_deliveries set next_attempt_at=? where outbox_id=? and installation_id=? and binding_version=? and status='SENT' and result_code='RECEIPT_PENDING'",Timestamp.from(Instant.now().plusSeconds(900)),item.outbox(),item.installation(),item.binding());
   else jdbc.update("update push_deliveries set attempt_count=attempt_count+1, status=case when attempt_count+1>=6 then 'FAILED' else 'PENDING' end, result_code='PROCESSING_ERROR', next_attempt_at=case when attempt_count+1>=6 then null else cast(? as timestamptz) end where outbox_id=? and installation_id=? and binding_version=? and status='PENDING'",Timestamp.from(Instant.now().plusSeconds(60)),item.outbox(),item.installation(),item.binding());
  });return true;}catch(Exception updateError){log.warn("푸시 실패 상태 기록 실패 outbox={} type={}",item.outbox(),updateError.getClass().getSimpleName());return false;}
 }
 private boolean fanOutOne(java.util.Set<UUID> skipped,UUID[] selected){
  var args=new java.util.ArrayList<Object>();args.add(installations.environment());args.add(installations.appId());args.addAll(skipped);
  String exclude=skipped.isEmpty()?"":" and outbox_id not in ("+String.join(",",java.util.Collections.nCopies(skipped.size(),"?"))+")";
  var rows=jdbc.query("select outbox_id,recipient_user_id from push_outbox where environment=? and app_id=? and status='PENDING'"+exclude+" order by created_at,outbox_id limit 1 for update skip locked",(r,n)->new Object[]{r.getObject(1,UUID.class),r.getLong(2)},args.toArray());
  if(rows.isEmpty())return false;UUID id=(UUID)rows.get(0)[0];selected[0]=id;long user=(long)rows.get(0)[1];
  jdbc.update("insert into push_deliveries(outbox_id,installation_id,binding_version,token_version,status,next_attempt_at) select ?,installation_id,binding_version,token_version,'PENDING',current_timestamp from push_installations where user_id=? and environment=? and app_id=? and enabled=true and disabled_at is null on conflict do nothing",id,user,installations.environment(),installations.appId());
  jdbc.update("update push_outbox set status=case when expires_at<=current_timestamp or notification_id is null then 'CANCELLED' else 'COMPLETE' end where outbox_id=?",id);
  return true;
 }
 private record Item(UUID outbox,UUID installation,long binding){}
 private Item next(){return jdbc.query("select d.outbox_id,d.installation_id,d.binding_version from push_deliveries d join push_installations i on i.installation_id=d.installation_id where i.environment=? and i.app_id=? and d.status='PENDING' and (d.next_attempt_at is null or d.next_attempt_at<=current_timestamp) order by d.next_attempt_at nulls first,d.outbox_id,d.installation_id limit 1",(r,n)->new Item(r.getObject(1,UUID.class),r.getObject(2,UUID.class),r.getLong(3)),installations.environment(),installations.appId()).stream().findFirst().orElse(null);}
 private void deliver(Item item){
  // 설치가 다른 계정으로 전환되면 이후 행 잠금 획득 후 다시 검사한다.
  var snapshots=jdbc.query("select user_id,session_id from push_installations where installation_id=?",(r,n)->new Object[]{r.getLong(1),r.getObject(2,UUID.class)},item.installation());if(snapshots.isEmpty()){cancelPending(item);return;}
  long user=(long)snapshots.get(0)[0];UUID sid=(UUID)snapshots.get(0)[1];
  var users=jdbc.query("select status,deleted_at from users where user_id=? for share",(r,n)->r.getString(1).equals("ACTIVE") && r.getTimestamp(2)==null,user);if(users.isEmpty()){cancelPending(item);return;}
  var sessions=jdbc.query("select revoked_at,expires_at from refresh_tokens where session_id=? and user_id=? for update",(r,n)->new Object[]{r.getTimestamp(1),r.getTimestamp(2).toInstant()},sid,user);
  var devices=jdbc.query("select user_id,session_id,enabled,disabled_at,binding_version,token_version,token_ciphertext,token_key_id,token_cipher_format from push_installations where installation_id=? for update",(r,n)->new Object[]{r.getLong(1),r.getObject(2,UUID.class),r.getBoolean(3),r.getTimestamp(4),r.getLong(5),r.getLong(6),r.getBytes(7),r.getString(8),r.getInt(9)},item.installation());if(devices.isEmpty()){cancelPending(item);return;}
  var deliveries=jdbc.query("select d.status,d.token_version,d.attempt_count,o.recipient_user_id,o.reference_id,o.expires_at,o.status,n.deleted_at,o.event_type from push_deliveries d join push_outbox o on o.outbox_id=d.outbox_id left join notifications n on n.notification_id=o.notification_id where d.outbox_id=? and d.installation_id=? and d.binding_version=? and (d.next_attempt_at is null or d.next_attempt_at<=current_timestamp) for update of d",(r,n)->new Object[]{r.getString(1),r.getLong(2),r.getInt(3),r.getLong(4),r.getString(5),r.getTimestamp(6).toInstant(),r.getString(7),r.getTimestamp(8),r.getString(9)},item.outbox(),item.installation(),item.binding());if(deliveries.isEmpty())return;
  Object[] d=deliveries.get(0),device=devices.get(0);if(!"PENDING".equals(d[0]))return;
  boolean valid=users.get(0)&&!sessions.isEmpty()&&sessions.get(0)[0]==null&&Instant.now().isBefore((Instant)sessions.get(0)[1])&&(long)device[0]==user&&sid.equals(device[1])&&(boolean)device[2]&&device[3]==null&&(long)device[4]==item.binding()&&(long)device[5]==(long)d[1]&&(long)d[3]==user&&Instant.now().isBefore((Instant)d[5])&&"COMPLETE".equals(d[6])&&d[7]==null&&device[6]!=null;
  // 삭제된 알림은 FK가 null이므로 별도로 확인한다.
  valid=valid&&!jdbc.query("select n.notification_id from notifications n join push_outbox o on o.notification_id=n.notification_id where o.outbox_id=? and n.deleted_at is null for share of n",(r,n)->r.getLong(1),item.outbox()).isEmpty();
  String reference=(String)d[4];
  if(valid && "DIARY_INVITE".equals(d[8]) && reference!=null && reference.matches("[1-9][0-9]{0,18}")) {
   try {valid=!jdbc.query("select i.invite_id from diary_invites i join diaries d on d.diary_id=i.diary_id where i.invite_id=? and i.invitee_user_id=? and i.invite_type='EMAIL' and i.revoked_at is null and i.use_count=0 and d.deleted_at is null and not exists(select 1 from diary_members m where m.diary_id=i.diary_id and m.user_id=i.invitee_user_id and m.left_at is null) for share of i",(r,n)->r.getLong(1),Long.parseLong(reference),user).isEmpty();}
   catch(NumberFormatException invalidId){valid=false;}
  } else valid=false;
  // 알림·초대 잠금 대기 동안 세션이나 대기열이 만료됐을 수 있다.
  if(valid && (!Instant.now().isBefore((Instant)sessions.get(0)[1]) || !Instant.now().isBefore((Instant)d[5])))valid=false;
  if(!valid){setResult(item,"CANCELLED",(int)d[2],null,"STALE",null);return;}
  try {
   var secrets=installations.secrets();byte[] cipher=(byte[])device[6];String key=(String)device[7];byte[] aad=installations.aad(item.installation(),"token");
   String token=new String((int)device[8]==0?secrets.decryptLegacy(key,cipher,aad):secrets.decrypt(key,cipher,aad),StandardCharsets.UTF_8);
   var result=gateway.sendInvitation(token,(String)d[4]);int attempts=(int)d[2]+1;
   if(result.accepted()){setResult(item,"SENT",attempts,result.ticketId(),"RECEIPT_PENDING",Instant.now().plusSeconds(900));jdbc.update("update push_deliveries set accepted_at=current_timestamp where outbox_id=? and installation_id=? and binding_version=?",item.outbox(),item.installation(),item.binding());}
   else if("DeviceNotRegistered".equals(result.code())){setResult(item,"FAILED",attempts,null,result.code(),null);jdbc.update("update push_installations set enabled=false,token_hash=null,token_ciphertext=null,token_key_id=null,token_cipher_format=null,token_version=token_version+1,updated_at=current_timestamp where installation_id=?",item.installation());}
   else retry(item,attempts,result.code());
  }catch(InterruptedException error){Thread.currentThread().interrupt();throw new IllegalStateException("푸시 발송 중단",error);}
  catch(Exception error){log.warn("푸시 발송 실패 outbox={} type={}",item.outbox(),error.getClass().getSimpleName());retry(item,(int)d[2]+1,"DELIVERY_ERROR");}
 }
 private Item nextReceipt(){return jdbc.query("select d.outbox_id,d.installation_id,d.binding_version from push_deliveries d join push_installations i on i.installation_id=d.installation_id where i.environment=? and i.app_id=? and d.status='SENT' and d.result_code='RECEIPT_PENDING' and d.next_attempt_at<=current_timestamp order by d.next_attempt_at,d.outbox_id limit 1",(r,n)->new Item(r.getObject(1,UUID.class),r.getObject(2,UUID.class),r.getLong(3)),installations.environment(),installations.appId()).stream().findFirst().orElse(null);}
 private void checkReceipt(Item item){
  var devices=jdbc.query("select binding_version,token_version from push_installations where installation_id=? for update",(r,n)->new long[]{r.getLong(1),r.getLong(2)},item.installation());if(devices.isEmpty())return;
  var rows=jdbc.query("select d.provider_ticket_id,d.token_version,d.attempt_count,d.accepted_at from push_deliveries d join push_outbox o on o.outbox_id=d.outbox_id where d.outbox_id=? and d.installation_id=? and d.binding_version=? and d.status='SENT' and d.result_code='RECEIPT_PENDING' and d.next_attempt_at<=current_timestamp for update of d",(r,n)->new Object[]{r.getString(1),r.getLong(2),r.getInt(3),(r.getTimestamp(4)==null?null:r.getTimestamp(4).toInstant())},item.outbox(),item.installation(),item.binding());if(rows.isEmpty())return;
  Object[] row=rows.get(0);String ticket=(String)row[0];int attempts=(int)row[2];
  if(row[3]==null || !Instant.now().isBefore(((Instant)row[3]).plusSeconds(86400))){setResult(item,"SENT",attempts,ticket,"RECEIPT_UNKNOWN",null);return;}
  try {
   var receipt=gateway.receipt(ticket);
   if(!receipt.ready()){setResult(item,"SENT",attempts,ticket,"RECEIPT_PENDING",Instant.now().plusSeconds(900));return;}
   if(receipt.delivered()){setResult(item,"SENT",attempts,ticket,"RECEIPT_OK",null);return;}
   setResult(item,"FAILED",attempts,ticket,receipt.code(),null);
   if("DeviceNotRegistered".equals(receipt.code()) && devices.get(0)[0]==item.binding() && devices.get(0)[1]==(long)row[1])
    jdbc.update("update push_installations set enabled=false,token_hash=null,token_ciphertext=null,token_key_id=null,token_cipher_format=null,token_version=token_version+1,updated_at=current_timestamp where installation_id=?",item.installation());
  } catch(InterruptedException error){Thread.currentThread().interrupt();throw new IllegalStateException("푸시 결과 조회 중단",error);}
  catch(Exception error){log.warn("푸시 결과 조회 실패 outbox={} type={}",item.outbox(),error.getClass().getSimpleName());setResult(item,"SENT",attempts,ticket,"RECEIPT_PENDING",Instant.now().plusSeconds(900));}
 }
 private void cancelPending(Item item){jdbc.update("update push_deliveries set status='CANCELLED',result_code='STALE',next_attempt_at=null where outbox_id=? and installation_id=? and binding_version=? and status='PENDING'",item.outbox(),item.installation(),item.binding());}
 private void retry(Item item,int attempts,String code){if(attempts>=6)setResult(item,"FAILED",attempts,null,code,null);else setResult(item,"PENDING",attempts,null,code,Instant.now().plusSeconds(Math.min(3600,30L*(1L<<Math.min(attempts-1,7)))));}
 private void setResult(Item item,String status,int attempts,String ticket,String code,Instant next){jdbc.update("update push_deliveries set status=?,attempt_count=?,provider_ticket_id=?,result_code=?,next_attempt_at=? where outbox_id=? and installation_id=? and binding_version=?",status,attempts,ticket,code,next==null?null:Timestamp.from(next),item.outbox(),item.installation(),item.binding());}
}
