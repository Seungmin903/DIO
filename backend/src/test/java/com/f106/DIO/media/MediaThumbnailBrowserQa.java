package com.f106.DIO.media;

/** Disposable, loopback-only browser fixture. Never uses a developer or shared database. */
public class MediaThumbnailBrowserQa {
 public static void main(String[] args) throws Exception {
  if(!"true".equals(System.getenv("DIO_MEDIA_THUMBNAIL_QA")))throw new IllegalStateException("Explicit thumbnail QA opt-in required");
  System.setProperty("server.address","127.0.0.1");System.setProperty("server.port","18567");
  System.setProperty("spring.datasource.url","jdbc:h2:mem:media-thumbnail-browser;MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
  System.setProperty("spring.datasource.username","sa");System.setProperty("spring.datasource.password","");
  System.setProperty("spring.flyway.enabled","false");System.setProperty("spring.jpa.hibernate.ddl-auto","create-drop");
  System.setProperty("dio.auth.session-cleanup.enabled","false");System.setProperty("dio.auth.development-token-header","");
  System.setProperty("dio.push.cleanup.enabled","false");System.setProperty("dio.media.expiry-cleanup.enabled","false");
  System.setProperty("dio.notification.retention.enabled","false");System.setProperty("dio.notification.watermark-cleanup.enabled","false");
  System.setProperty("dio.media.storage","local");System.setProperty("dio.media.local-directory","build/thumbnail-browser-qa/media");
  System.setProperty("AUTH_ALLOWED_ORIGINS","http://127.0.0.1:18569");
  byte[] secret=new byte[32];new java.security.SecureRandom().nextBytes(secret);
  System.setProperty("dio.auth.jwt-secret",java.util.Base64.getEncoder().encodeToString(secret));
  var app=new org.springframework.boot.SpringApplication(com.f106.DIO.DioApplication.class);app.setAdditionalProfiles("test");
  var context=app.run();
  var users=context.getBean(com.f106.DIO.user.repository.UserRepository.class);
  var accounts=context.getBean(com.f106.DIO.auth.repository.EmailAuthProviderRepository.class);
  var media=context.getBean(com.f106.DIO.media.service.MediaService.class);
  var jdbc=context.getBean(org.springframework.jdbc.core.JdbcTemplate.class);
  var owner=users.saveAndFlush(new com.f106.DIO.user.domain.User("thumbnail-qa@example.test","썸네일QA",java.time.Instant.now()));
  accounts.saveAndFlush(new com.f106.DIO.auth.domain.EmailAuthProvider(owner.getUserId(),owner.getEmail(),
   new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(4).encode("DioThumbnail123!"),java.time.Instant.now()));
  for(int i=1;i<=36;i++){
   var image=new java.awt.image.BufferedImage(960,480,java.awt.image.BufferedImage.TYPE_INT_RGB);
   var g=image.createGraphics();g.setColor(new java.awt.Color(70+i*4,70+i*3,200-i*3));g.fillRect(0,0,960,480);
   g.setColor(java.awt.Color.WHITE);g.setFont(new java.awt.Font("SansSerif",java.awt.Font.BOLD,100));g.drawString("PHOTO "+i,80,250);g.dispose();
   var bytes=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(image,"png",bytes);
   var row=media.upload(new org.springframework.mock.web.MockMultipartFile("file","old-photo-"+i+".png","image/png",bytes.toByteArray()),null,owner.getUserId());
   jdbc.update("update media_files set created_at=? where media_file_id=?",java.sql.Timestamp.from(java.time.Instant.now().minusSeconds(2*86400L+i)),row.mediaFileId());
  }
  System.out.println("MEDIA_THUMBNAIL_QA_READY loopback-only H2, 36 images older than today");
 }
}
