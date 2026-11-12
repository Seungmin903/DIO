package com.f106.DIO.media.service;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.dto.MediaFileResponse;
import com.f106.DIO.media.storage.MediaFiles;
import com.f106.DIO.media.storage.MediaStorageKeys;
import com.f106.DIO.media.support.MediaFileNotFoundException;

/** Holds the queue row lock across synchronous storage operations, including commit. */
@Service
public class GuardedMediaOperations {
 private final JdbcTemplate jdbc; private final TransactionTemplate tx; private final MediaFiles files; private final MediaFileTransactionService transactions;
 public GuardedMediaOperations(JdbcTemplate jdbc, PlatformTransactionManager manager, MediaFiles files, MediaFileTransactionService transactions) {
  this.jdbc=jdbc; this.tx=new TransactionTemplate(manager); this.files=files; this.transactions=transactions;
 }
 public MediaFileResponse upload(MediaFile media, UUID taskId, byte[] bytes, String mime) {
  return tx.execute(status -> {
   var keys=jdbc.queryForList("select storage_key from media_storage_deletion_queue where deletion_id=? for update",String.class,taskId);
   if(keys.size()!=1 || !media.getStorageKey().equals(keys.get(0))) throw new IllegalStateException("Upload reservation is unavailable");
   files.put(media.getStorageKey(),bytes,mime);
   return transactions.persist(media,taskId);
  });
 }
 public boolean deleteIfUnlocked(UUID taskId) {
  Boolean result=tx.execute(status -> {
   var keys=jdbc.queryForList("select storage_key from media_storage_deletion_queue where deletion_id=? for update skip locked",String.class,taskId);
   if(keys.isEmpty()) return false;
   String key=keys.get(0);
   if(key.startsWith("media/image/")) files.delete(MediaStorageKeys.thumbnail(key));
   files.delete(key);
   jdbc.update("delete from media_storage_deletion_queue where deletion_id=?",taskId);
   return true;
  });
  return Boolean.TRUE.equals(result);
 }
 /** Serialize derivative publication with physical deletion of the source row. */
 public void storeThumbnail(UUID id, String originalKey, byte[] bytes) {
  tx.executeWithoutResult(status -> {
   var keys=jdbc.queryForList("select storage_key from media_files where media_file_id=? and status='READY' for update",String.class,id);
   if(keys.size()!=1 || !originalKey.equals(keys.get(0))) throw new MediaFileNotFoundException();
   files.put(MediaStorageKeys.thumbnail(originalKey),bytes,"image/png");
  });
 }
}
