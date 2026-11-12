package com.f106.DIO.localseed;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.page.repository.CanvasElementRepository;
import com.f106.DIO.page.repository.DiaryPageRepository;
import com.f106.DIO.user.infrastructure.storage.ProfilePhotoFiles;
import com.f106.DIO.user.repository.ProfilePhotoRepository;
import com.f106.DIO.user.repository.UserRepository;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;

@SpringBootTest(properties = {
	"spring.datasource.url=jdbc:h2:mem:local_seed;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
	"spring.datasource.username=sa",
	"spring.datasource.password=",
	"spring.jpa.hibernate.ddl-auto=create-drop",
	"spring.flyway.enabled=false",
	"dio.signup.photos.local-directory=${java.io.tmpdir}/dio-local-seed-test",
	"dio.local-seed.enabled=true",
	"dio.local-seed.file=src/test/resources/local-demo-seed.json"
})
@ActiveProfiles("local")
class LocalDemoSeedIntegrationTests {

	private static final UUID DIARY_ID = UUID.fromString("e1000000-0000-4000-8000-000000000001");
	private static final UUID PAGE_ID = UUID.fromString("e1000000-0000-4000-8000-000000000101");
	private static final UUID ELEMENT_ID = UUID.fromString("e1000000-0000-4000-8000-000000001001");

	@Autowired DiaryRepository diaries;
	@Autowired DiaryPageRepository pages;
	@Autowired CanvasElementRepository elements;
	@Autowired UserRepository users;
	@Autowired ProfilePhotoRepository photos;
	@Autowired ProfilePhotoFiles photoFiles;
	@Autowired EmailAuthProviderRepository accounts;

	@Test
	void localProfileImportsTheSeedIntoTheDatabase() {
		assertThat(diaries.findById(DIARY_ID)).isPresent();
		assertThat(pages.findById(PAGE_ID)).isPresent();
		assertThat(elements.findById(ELEMENT_ID)).isPresent();
		assertThat(elements.findById(ELEMENT_ID).orElseThrow().getPropertiesJson()).isEqualTo("{\"text\":\"시드\"}");
		var user = users.findByEmail("local.seed@example.com").orElseThrow();
		assertThat(accounts.findByProviderAndProviderUserId("EMAIL", user.getEmail())).isPresent();
		var photo = photos.findByUserId(user.getUserId()).orElseThrow();
		assertThat(photoFiles.read(photo)).startsWith((byte) 0x89, (byte) 0x50, (byte) 0x4e, (byte) 0x47);
	}
}
