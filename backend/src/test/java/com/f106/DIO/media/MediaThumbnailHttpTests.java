package com.f106.DIO.media;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import com.f106.DIO.media.service.*;
import com.f106.DIO.media.storage.*;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;

@SpringBootTest
@AutoConfigureMockMvc
class MediaThumbnailHttpTests {
 @Autowired MockMvc mvc;
 @Autowired MediaService media;
 @Autowired MediaFiles files;
 @Autowired UserRepository users;
 @Autowired JdbcTemplate jdbc;
 @Autowired GuardedMediaOperations guarded;
 @Autowired MediaStorageDeletionQueueService cleanup;
 private long user(){String id=UUID.randomUUID().toString().substring(0,10);return users.saveAndFlush(new User(id+"@example.test",id,Instant.now())).getUserId();}
 public static byte[] png() throws Exception {
  var image=new BufferedImage(960,480,BufferedImage.TYPE_INT_ARGB);
  image.setRGB(480,240,0xffff0088);
  var bytes=new ByteArrayOutputStream();ImageIO.write(image,"png",bytes);return bytes.toByteArray();
 }
 @Test void oldImageGeneratesASeparatePersistentThumbnailAndKeepsOriginal() throws Exception {
  long owner=user();byte[] original=png();
  var row=media.upload(new MockMultipartFile("file","old.png","image/png",original),null,owner);
  jdbc.update("update media_files set created_at=? where media_file_id=?",java.sql.Timestamp.from(Instant.now().minusSeconds(3*86400)),row.mediaFileId());
  String path="/api/v1/media/"+row.mediaFileId()+"/thumbnail";
  mvc.perform(get(path)).andExpect(status().isUnauthorized());
  byte[] bytes=mvc.perform(get(path).with(jwt().jwt(t->t.subject(Long.toString(owner)))))
   .andExpect(status().isOk()).andExpect(content().contentType("image/png"))
   .andExpect(header().string("Cache-Control","private, no-store"))
   .andExpect(header().string("X-Content-Type-Options","nosniff")).andReturn().getResponse().getContentAsByteArray();
  var image=ImageIO.read(new ByteArrayInputStream(bytes));assertThat(image.getWidth()).isEqualTo(320);assertThat(image.getHeight()).isEqualTo(160);
  assertThat(media.file(row.mediaFileId(),owner).content()).isEqualTo(original);
  String key=jdbc.queryForObject("select storage_key from media_files where media_file_id=?",String.class,row.mediaFileId());
  assertThat(files.read(MediaStorageKeys.thumbnail(key))).isEqualTo(bytes);
  // A second GET uses the saved derivative, even if decoding the source would now fail.
  files.put(key,new byte[]{1},"image/png");
  mvc.perform(get(path).with(jwt().jwt(t->t.subject(Long.toString(owner))))).andExpect(status().isOk()).andExpect(content().bytes(bytes));
  mvc.perform(get(path).with(jwt().jwt(t->t.subject(Long.toString(user()))))).andExpect(status().isNotFound());
  media.delete(row.mediaFileId(),owner);
  mvc.perform(get(path).with(jwt().jwt(t->t.subject(Long.toString(owner))))).andExpect(status().isNotFound());
 }
 @Test void audioAndMissingMediaDoNotGenerateThumbnails() throws Exception {
  long owner=user();
  byte[] wav={'R','I','F','F',0,0,0,0,'W','A','V','E'};
  var row=media.upload(new MockMultipartFile("file","a.wav","audio/wav",wav),null,owner);
  mvc.perform(get("/api/v1/media/"+row.mediaFileId()+"/thumbnail").with(jwt().jwt(t->t.subject(Long.toString(owner)))))
   .andExpect(status().isUnsupportedMediaType()).andExpect(jsonPath("$.code").value("MEDIA_THUMBNAIL_UNSUPPORTED"));
  mvc.perform(get("/api/v1/media/"+UUID.randomUUID()+"/thumbnail").with(jwt().jwt(t->t.subject(Long.toString(owner))))).andExpect(status().isNotFound());
 }
 @Test void cleanupRemovesTheDerivativeTogetherWithTheOriginal() throws Exception {
  long owner=user();var row=media.upload(new MockMultipartFile("file","a.png","image/png",png()),null,owner);
  media.thumbnail(row.mediaFileId(),owner);
  String key=jdbc.queryForObject("select storage_key from media_files where media_file_id=?",String.class,row.mediaFileId());
  var reservation=cleanup.reserveUploadCleanup(row.mediaFileId(),key);
  assertThat(guarded.deleteIfUnlocked(reservation.getDeletionId())).isTrue();
  assertThatThrownBy(()->files.read(key)).isInstanceOf(MediaStorageException.class);
  assertThatThrownBy(()->files.read(MediaStorageKeys.thumbnail(key))).isInstanceOf(MediaStorageException.class);
 }
}
