package com.f106.DIO.localseed;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import com.f106.DIO.auth.domain.EmailAuthProvider;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.page.domain.CanvasElement;
import com.f106.DIO.page.domain.DiaryPage;
import com.f106.DIO.page.repository.CanvasElementRepository;
import com.f106.DIO.page.repository.DiaryPageRepository;
import com.f106.DIO.user.domain.ProfilePhoto;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.infrastructure.storage.LocalProfilePhotoStorage;
import com.f106.DIO.user.repository.ProfilePhotoRepository;
import com.f106.DIO.user.repository.UserRepository;
import com.f106.DIO.user.support.ProfilePhotoImages;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 로컬 프로필과 명시적인 환경변수가 모두 있어야만 동작한다.
 * 시드 본문은 dio.local-seed.file(기본 src/main/resources/db/seed/local-demo.json)에서 읽는다.
 * 이 폴더는 .gitignore·.dockerignore 대상이므로 비밀번호가 든 시드는 여기에만 둔다.
 */
@Component
@Profile("local")
@ConditionalOnProperty(prefix = "dio.local-seed", name = "enabled", havingValue = "true")
public class LocalDemoSeedRunner implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(LocalDemoSeedRunner.class);
	private static final JsonMapper JSON = JsonMapper.builder().build();

	private final DiaryRepository diaryRepository;
	private final DiaryMemberRepository diaryMemberRepository;
	private final DiaryPageRepository pageRepository;
	private final CanvasElementRepository elementRepository;
	private final UserRepository userRepository;
	private final ProfilePhotoRepository profilePhotoRepository;
	private final LocalProfilePhotoStorage localProfilePhotoStorage;
	private final EmailAuthProviderRepository accountRepository;
	private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
	private final String seedFile;

	public LocalDemoSeedRunner(DiaryRepository diaryRepository, DiaryMemberRepository diaryMemberRepository, DiaryPageRepository pageRepository,
		CanvasElementRepository elementRepository, UserRepository userRepository, ProfilePhotoRepository profilePhotoRepository,
		LocalProfilePhotoStorage localProfilePhotoStorage, EmailAuthProviderRepository accountRepository,
		@org.springframework.beans.factory.annotation.Value("${dio.local-seed.file}") String seedFile) {
		this.diaryRepository = diaryRepository;
		this.diaryMemberRepository = diaryMemberRepository;
		this.pageRepository = pageRepository;
		this.elementRepository = elementRepository;
		this.userRepository = userRepository;
		this.profilePhotoRepository = profilePhotoRepository;
		this.localProfilePhotoStorage = localProfilePhotoStorage;
		this.accountRepository = accountRepository;
		this.seedFile = seedFile;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		Path path = Path.of(seedFile).toAbsolutePath().normalize();
		if (!Files.isRegularFile(path)) {
			throw new IllegalStateException("로컬 시드 파일을 찾을 수 없습니다: " + path);
		}

		SeedDocument document;
		try {
			document = JSON.readValue(Files.readString(path), SeedDocument.class);
		} catch (Exception exception) {
			throw new IllegalStateException("로컬 시드 파일을 읽을 수 없습니다: " + path, exception);
		}

		SeedResult result = new SeedResult();
		for (SeedUser user : values(document == null ? null : document.users())) {
			seedUser(required(user, "users 항목"), result);
		}
		String defaultOwnerEmail = values(document == null ? null : document.users()).stream()
			.map(SeedUser::email).filter(java.util.Objects::nonNull).findFirst().orElse(null);
		for (SeedDiary diary : values(document == null ? null : document.diaries())) {
			seedDiary(required(diary, "diaries 항목"), defaultOwnerEmail, result);
		}
		log.info("Local demo seed completed: users={}, accounts={}, photos={}, diaries={}, pages={}, elements={}, file={}",
			result.users, result.accounts, result.photos, result.diaries, result.pages, result.elements, path);
	}

	private void seedUser(SeedUser input, SeedResult result) {
		String email = required(input.email(), "email");
		User user = userRepository.findByEmail(email).orElseGet(() -> {
			result.users++;
			return userRepository.saveAndFlush(new User(email, required(input.nickname(), "nickname"), Instant.now()));
		});
		if (input.password() != null && accountRepository.findByProviderAndProviderUserId("EMAIL", email).isEmpty()) {
			accountRepository.saveAndFlush(new EmailAuthProvider(user.getUserId(), email, passwords.encode(input.password()), Instant.now()));
			result.accounts++;
		}
		if (input.photoPngBase64() == null || profilePhotoRepository.findByUserId(user.getUserId()).isPresent()) return;
		UUID photoId = input.photoId() == null ? UUID.randomUUID() : input.photoId();
		byte[] png;
		try { png = Base64.getDecoder().decode(input.photoPngBase64()); }
		catch (IllegalArgumentException exception) { throw new IllegalStateException("로컬 시드의 photoPngBase64가 올바르지 않습니다.", exception); }
		var location = localProfilePhotoStorage.location(photoId);
		localProfilePhotoStorage.put(location, ProfilePhotoImages.prepare(png));
		profilePhotoRepository.saveAndFlush(new ProfilePhoto(photoId, user.getUserId(), location.provider(), location.key(),
			location.bucket(), Instant.now()));
		result.photos++;
	}

	private void seedDiary(SeedDiary input, String defaultOwnerEmail, SeedResult result) {
		UUID diaryId = required(input.diaryId(), "diaryId");
		String ownerEmail = input.ownerEmail() == null ? defaultOwnerEmail : input.ownerEmail();
		Long ownerUserId = userRepository.findByEmail(required(ownerEmail, "diaries.ownerEmail"))
			.map(User::getUserId).orElseThrow(() -> new IllegalStateException("로컬 시드의 다이어리 소유자를 찾을 수 없습니다: " + ownerEmail));
		Diary diary = diaryRepository.findById(diaryId).orElse(null);
		if (diary == null) {
			diary = new Diary(diaryId, required(input.title(), "title"), input.coverColor(), input.coverStyle(), input.visibility());
			diary.claimOwnerIfMissing(ownerUserId);
			diaryRepository.saveAndFlush(diary);
			result.diaries++;
		} else {
			diary.claimOwnerIfMissing(ownerUserId);
			diaryRepository.flush();
		}
		if (diaryMemberRepository.findByDiaryIdAndUserIdAndLeftAtIsNull(diaryId, ownerUserId).isEmpty()) {
			diaryMemberRepository.saveAndFlush(new DiaryMember(diaryId, ownerUserId, "OWNER"));
		}

		int pageOrder = 1;
		for (SeedPage page : values(input.pages())) {
			seedPage(diaryId, required(page, "pages 항목"), pageOrder++, result);
		}
	}

	private void seedPage(UUID diaryId, SeedPage input, int pageOrder, SeedResult result) {
		UUID pageId = required(input.pageId(), "pageId");
		if (!pageRepository.existsById(pageId)) {
			pageRepository.saveAndFlush(new DiaryPage(pageId, diaryId, null, json(input.templateConfig()), input.title(),
				input.sortKey() == null ? BigDecimal.valueOf(pageOrder) : input.sortKey(),
				input.canvasWidth() == null ? new BigDecimal("1280.00") : input.canvasWidth(),
				input.canvasHeight() == null ? new BigDecimal("800.00") : input.canvasHeight(),
				Boolean.TRUE.equals(input.gridVisible()), input.gridColor()));
			result.pages++;
		}

		int elementOrder = 1;
		for (SeedElement element : values(input.elements())) {
			seedElement(pageId, required(element, "elements 항목"), elementOrder++, result);
		}
	}

	private void seedElement(UUID pageId, SeedElement input, int elementOrder, SeedResult result) {
		UUID elementId = required(input.elementId(), "elementId");
		if (elementRepository.existsById(elementId)) return;
		elementRepository.saveAndFlush(new CanvasElement(elementId, pageId, required(input.elementType(), "elementType"),
			null, input.name(), input.sortKey() == null ? BigDecimal.valueOf(elementOrder) : input.sortKey(),
			required(input.x(), "x"), required(input.y(), "y"), required(input.width(), "width"), required(input.height(), "height"),
			input.rotation() == null ? BigDecimal.ZERO : input.rotation(), input.opacity() == null ? BigDecimal.ONE : input.opacity(),
			Boolean.TRUE.equals(input.isLocked()), Boolean.TRUE.equals(input.isHidden()), null, json(input.propertiesJson())));
		result.elements++;
	}

	private static String json(JsonNode value) { return value == null ? null : value.toString(); }
	private static <T> T required(T value, String field) {
		if (value == null) throw new IllegalStateException("로컬 시드의 " + field + " 값이 필요합니다.");
		return value;
	}
	private static <T> List<T> values(List<T> values) { return values == null ? List.of() : values; }

	private record SeedDocument(List<SeedUser> users, List<SeedDiary> diaries) { }
	private record SeedUser(String email, String nickname, String password, UUID photoId, String photoPngBase64) { }
	private record SeedDiary(UUID diaryId, String ownerEmail, String title, String coverColor, String coverStyle, String visibility,
		List<SeedPage> pages) { }
	private record SeedPage(UUID pageId, String title, BigDecimal sortKey, BigDecimal canvasWidth,
		BigDecimal canvasHeight, Boolean gridVisible, String gridColor, JsonNode templateConfig, List<SeedElement> elements) { }
	private record SeedElement(UUID elementId, String elementType, String name, BigDecimal sortKey, BigDecimal x,
		BigDecimal y, BigDecimal width, BigDecimal height, BigDecimal rotation, BigDecimal opacity, Boolean isLocked,
		Boolean isHidden, JsonNode propertiesJson) { }
	private static final class SeedResult { int users; int accounts; int photos; int diaries; int pages; int elements; }
}
