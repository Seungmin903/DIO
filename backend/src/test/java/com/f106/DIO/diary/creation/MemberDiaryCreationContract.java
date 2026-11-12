package com.f106.DIO.diary.creation;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import com.f106.DIO.diary.dto.DiaryCreateRequest;

import static org.assertj.core.api.Assertions.*;

/** 제품 JDBC 페이지 어댑터의 H2/PostgreSQL 공통 트랜잭션 계약. */
abstract class MemberDiaryCreationContract {
	JdbcTemplate jdbc;
	TransactionTemplate tx;
	ValidatorFactory validation;
	MemberDiaryCreationRepository repository;
	MemberDiaryCreationService service;
	DiaryOwnerMembershipWriter owner;
	DiaryInitialPages pages;
	AtomicLong actor=new AtomicLong(1);
	static final Instant AT=Instant.parse("2026-10-27T00:00:00Z");
	abstract DriverManagerDataSource database();
	abstract void cleanupDatabase();

	@BeforeEach
	void fixtures() {
		var dataSource=database();
		jdbc=new JdbcTemplate(dataSource); jdbc.setQueryTimeout(5);
		tx=new TransactionTemplate(new DataSourceTransactionManager(dataSource));
		jdbc.update("insert into users(user_id,nickname,nickname_key,status,profile_color) values (1,'owner','owner','ACTIVE','#123456'),(2,'other','other','ACTIVE','#654321')");
		jdbc.update("insert into page_templates(template_id,code,template_version,name,category,orientation,canvas_width,canvas_height) values (-10,'BLANK','1','blank','BASIC','LANDSCAPE',1024,768)");
		repository=new MemberDiaryCreationRepository(jdbc);
		owner=repository::insertOwner;
		pages=new TestPages();
		validation=Validation.buildDefaultValidatorFactory();
		service=service(owner,pages);
	}
	MemberDiaryCreationService service(DiaryOwnerMembershipWriter membership,DiaryInitialPages initialPages) {
		return new MemberDiaryCreationService(repository,actor::get,membership,initialPages,validation.getValidator(),Clock.fixed(AT,ZoneOffset.UTC),512, org.mockito.Mockito.mock(com.f106.DIO.inventory.InventoryLimits.class));
	}
	@AfterEach
	void cleanup() { if(validation!=null) validation.close(); cleanupDatabase(); }
	DiaryCreateRequest metadata() { return new DiaryCreateRequest("  diary  ","#112233","PLAIN","PRIVATE"); }
	List<DiaryInitialPages.Selection> selections(int count) {
		return java.util.stream.IntStream.range(0,count).mapToObj(i -> new DiaryInitialPages.Selection("BLANK","1","{}")).toList();
	}
	void noCreatedRows() {
		assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isZero();
		assertThat(jdbc.queryForObject("select count(*) from diary_members",Long.class)).isZero();
		assertThat(jdbc.queryForObject("select count(*) from pages",Long.class)).isZero();
	}
	void error(int status,Runnable action) {
		assertThatThrownBy(action::run).isInstanceOfSatisfying(DiaryCreationException.class,e -> assertThat(e.status().value()).isEqualTo(status));
	}

	@Test void createsDiaryOwnerAndEveryRequestedPageTogether() {
		var created=tx.execute(s -> service.create(metadata(),selections(3)));
		assertThat(created.diary().diaryTitle()).isEqualTo("diary");
		assertThat(created.pageIds()).hasSize(3).doesNotHaveDuplicates();
		assertThat(created.firstPageId()).isEqualTo(created.pageIds().get(0));
		assertThat(jdbc.queryForObject("select owner_user_id from diaries",Long.class)).isEqualTo(1);
		assertThat(jdbc.queryForObject("select role from diary_members",String.class)).isEqualTo("OWNER");
		assertThat(jdbc.queryForObject("select user_id from diary_members",Long.class)).isEqualTo(1);
		assertThat(jdbc.queryForObject("select member_color from diary_members",String.class)).isEqualTo("#123456");
		assertThat(jdbc.queryForObject("select count(*) from pages where canvas_width=1024 and canvas_height=768",Long.class)).isEqualTo(3);
		assertThat(jdbc.queryForList("select page_id from pages order by sort_key",UUID.class).stream().map(UUID::toString).toList()).isEqualTo(created.pageIds());
	}

	@Test void retainsTheExistingMultiPageShapeInsteadOfCreatingOnlyOnePage() {
		var created=tx.execute(s -> service.create(metadata(),selections(78)));
		assertThat(created.pageIds()).hasSize(78);
		assertThat(jdbc.queryForObject("select count(*) from pages",Long.class)).isEqualTo(78);
	}

	@Test void ownerInsertFailureRollsBackTheDiaryAndMembership() {
		var broken=service((id,user,color,at) -> { owner.create(id,user,color,at); throw new IllegalStateException("owner failure"); },pages);
		assertThatThrownBy(() -> tx.execute(s -> broken.create(metadata(),selections(1)))).isInstanceOf(IllegalStateException.class);
		noCreatedRows();
	}

	@Test void pageFailureAfterOneInsertRollsBackAllThreeKindsOfRows() {
		var broken=service(owner,new TestPages() {
			@Override public List<UUID> create(UUID id,long user,List<Selection> selected,Instant at) {
				super.create(id,user,selected.subList(0,1),at);
				throw new IllegalStateException("page failure");
			}
		});
		assertThatThrownBy(() -> tx.execute(s -> broken.create(metadata(),selections(3)))).isInstanceOf(IllegalStateException.class);
		noCreatedRows();
	}

	@Test void invalidCatalogVersionInactiveTemplateAndInvalidSettingsAreRejected() {
		for(var selected:List.of(new DiaryInitialPages.Selection("UNKNOWN","1","{}"),new DiaryInitialPages.Selection("BLANK","2","{}"),new DiaryInitialPages.Selection("BLANK","1","not-json"))) {
			error(400,() -> tx.execute(s -> service.create(metadata(),List.of(selected)))); noCreatedRows();
		}
		jdbc.update("update page_templates set is_active=false");
		error(400,() -> tx.execute(s -> service.create(metadata(),selections(1)))); noCreatedRows();
	}

	@Test void emptyTooLargeAndMalformedPageSelectionsAreRejected() {
		for(var selected:Arrays.asList(null,List.<DiaryInitialPages.Selection>of(),selections(513),Collections.<DiaryInitialPages.Selection>singletonList(null),List.of(new DiaryInitialPages.Selection(" ","1","{}")))) {
			error(400,() -> tx.execute(s -> service.create(metadata(),selected))); noCreatedRows();
		}
	}

	@Test void malformedMetadataAndPrematureSharingAreRejected() {
		for(var metadata:Arrays.asList(null,new DiaryCreateRequest(" ",null,null,null),new DiaryCreateRequest("valid","red",null,null),new DiaryCreateRequest("valid",null,null,"MEMBERS"))) {
			error(400,() -> tx.execute(s -> service.create(metadata,selections(1)))); noCreatedRows();
		}
	}

	@Test void inactiveDeletedMissingAndUnverifiedUsersCannotCreateAnything() {
		jdbc.update("update users set status='SUSPENDED' where user_id=1");
		error(401,() -> tx.execute(s -> service.create(metadata(),selections(1))));
		jdbc.update("update users set status='ACTIVE',deleted_at=? where user_id=1",Timestamp.from(AT));
		error(401,() -> tx.execute(s -> service.create(metadata(),selections(1))));
		actor.set(999); error(401,() -> tx.execute(s -> service.create(metadata(),selections(1))));
		actor.set(0); error(401,() -> tx.execute(s -> service.create(metadata(),selections(1))));
		noCreatedRows();
	}

	@Test void unavailableCustomPageModuleFailsBeforeSavingAnyDiary() {
		var unconnected=service(owner,new TestPages() {
			@Override public void validateSelections(List<Selection> selected) { throw DiaryCreationException.pagesNotConnected(); }
		});
		error(503,() -> tx.execute(s -> unconnected.create(metadata(),selections(1)))); noCreatedRows();
	}

	@Test void aMissingOrWrongOwnerMembershipRollsBackThePageAndDiary() {
		var missing=service((id,user,color,at) -> {},pages);
		error(500,() -> tx.execute(s -> missing.create(metadata(),selections(1)))); noCreatedRows();
		var wrong=service((id,user,color,at) -> repository.insertOwner(id,2,color,at),pages);
		error(500,() -> tx.execute(s -> wrong.create(metadata(),selections(1)))); noCreatedRows();
	}

	@Test void fabricatedMissingDuplicateOrReorderedPageResultsRollBack() {
		for(int scenario=0;scenario<4;scenario++) {
			final int mode=scenario;
			var broken=service(owner,new TestPages() {
				@Override public List<UUID> create(UUID id,long user,List<Selection> selected,Instant at) {
					var actual=new ArrayList<>(super.create(id,user,selected,at));
					if(mode==0) actual.set(0,UUID.randomUUID());
					if(mode==1) actual.remove(0);
					if(mode==2) actual.set(1,actual.get(0));
					if(mode==3) Collections.reverse(actual);
					return actual;
				}
			});
			error(500,() -> tx.execute(s -> broken.create(metadata(),selections(2)))); noCreatedRows();
		}
	}

	@Test void aFailedAttemptCanBeRetriedInANewTransaction() {
		var broken=service(owner,new TestPages() {
			@Override public List<UUID> create(UUID id,long user,List<Selection> selected,Instant at) { super.create(id,user,selected,at); throw new IllegalStateException("retry"); }
		});
		assertThatThrownBy(() -> tx.execute(s -> broken.create(metadata(),selections(2)))).isInstanceOf(IllegalStateException.class);
		noCreatedRows();
		var created=tx.execute(s -> service.create(metadata(),selections(2)));
		assertThat(created.pageIds()).hasSize(2);
		assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isEqualTo(1);
	}

	@Test void bypassingTheTransactionBoundaryIsRejectedBeforeAnyWrite() {
		assertThatThrownBy(() -> service.create(metadata(),selections(1))).isInstanceOf(IllegalStateException.class);
		noCreatedRows();
	}

	@Test void preservesMixedVersionsOrientationsDuplicatesAndRequestedOrder() {
		jdbc.update("insert into page_templates(template_id,code,template_version,name,category,orientation,canvas_width,canvas_height) values (-22,'BLANK','2','portrait','BASIC','PORTRAIT',768,1024)");
		var portrait=new DiaryInitialPages.Selection("BLANK","2","{\"width\":768,\"height\":1024}");
		var created=tx.execute(s -> service.create(metadata(),List.of(portrait,selections(1).get(0),portrait)));
		assertThat(jdbc.queryForList("select template_id from pages order by sort_key",Long.class)).containsExactly(-22L,-10L,-22L);
		assertThat(jdbc.queryForList("select canvas_width from pages order by sort_key",java.math.BigDecimal.class).stream().map(java.math.BigDecimal::intValue).toList()).containsExactly(768,1024,768);
		assertThat(created.pageIds()).hasSize(3).doesNotHaveDuplicates();
		for (var config:jdbc.queryForList("select template_config from pages order by sort_key",String.class)) {
			assertThat(new tools.jackson.databind.ObjectMapper().readTree(config).isObject()).isTrue();
		}
	}

	void catalogDefaults(String config) {
		boolean pg=Boolean.TRUE.equals(jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Boolean>)c -> "PostgreSQL".equals(c.getMetaData().getDatabaseProductName())));
		jdbc.update("update page_templates set default_config="+(pg?"cast(? as jsonb)":"? format json")+" where template_id=-10",config);
	}

	@Test void mergesPaperColorsWithCatalogDefaultsWithoutChangingTheCatalog() {
		catalogDefaults("{\"paperAppearance\":{\"backgroundColor\":\"#ffffff\",\"layoutColor\":\"#292929\"},\"blank\":false}");
		var selected=new DiaryInitialPages.Selection("BLANK","1","{\"paperAppearance\":{\"backgroundColor\":\"#abcdef\"},\"blank\":true}");
		tx.execute(s -> service.create(metadata(),List.of(selected)));
		var json=new tools.jackson.databind.ObjectMapper().readTree(jdbc.queryForObject("select template_config from pages",String.class));
		assertThat(json.get("width").asInt()).isEqualTo(1024);
		assertThat(json.get("height").asInt()).isEqualTo(768);
		assertThat(json.get("paperAppearance").get("backgroundColor").asString()).isEqualTo("#ABCDEF");
		assertThat(json.get("paperAppearance").get("layoutColor").asString()).isEqualTo("#292929");
		assertThat(json.get("blank").asBoolean()).isTrue();
		var defaults=new tools.jackson.databind.ObjectMapper().readTree(jdbc.queryForObject("select default_config from page_templates where template_id=-10",String.class));
		assertThat(defaults.get("paperAppearance").get("backgroundColor").asString()).isEqualTo("#ffffff");
		assertThat(defaults.get("blank").asBoolean()).isFalse();
	}

	@Test void invalidUnsupportedOversizedDuplicateAndTrailingSettingsAreRejected() {
		for (var config:List.of("null","[]","true","{} {}","{\"blank\":true,\"blank\":false}",
			"{\"width\":768}","{\"height\":null}","{\"blank\":\"true\"}","{\"ownerUserId\":2}",
			"{\"paperAppearance\":null}","{\"paperAppearance\":{\"layoutColor\":\"red\"}}",
			"{\"paperAppearance\":{\"backgroundColor\":123}}","{\"paperAppearance\":{\"script\":\"x\"}}",
			" ".repeat(16385),"{\"nested\":"+"[".repeat(20)+"0"+"]".repeat(20)+"}")) {
			error(400,() -> tx.execute(s -> service.create(metadata(),List.of(new DiaryInitialPages.Selection("BLANK","1",config)))));
			noCreatedRows();
		}
	}

	/** 원격 속지 가로 행. PostgreSQL 은 마이그레이션(V34)이 이미 넣었으므로 그 행을 쓰고, H2 처럼 없을 때만 넣는다(같은 코드가 둘이면 모호해서 거부된다) */
	long remoteLandscapeTemplate() {
		var existing=jdbc.queryForList("select template_id from page_templates where code='dio-remote-landscape' and template_version='1.0.0'",Long.class);
		if (!existing.isEmpty()) return existing.get(0);
		jdbc.update("insert into page_templates(template_id,code,template_version,name,category,orientation,canvas_width,canvas_height) values (-30,'dio-remote-landscape','1.0.0','추가 속지 · 가로','REMOTE','LANDSCAPE',1024,768)");
		return -30L;
	}

	@Test void remoteTemplatePagesKeepTheirRemoteTemplateId() {
		long templateId=remoteLandscapeTemplate();
		var selected=new DiaryInitialPages.Selection("dio-remote-landscape","1.0.0","{\"width\":1024,\"height\":768,\"remoteTemplate\":\"spring-note\",\"paperAppearance\":{\"backgroundColor\":\"#fffdf7\"}}");
		tx.execute(s -> service.create(metadata(),List.of(selected)));
		var json=new tools.jackson.databind.ObjectMapper().readTree(jdbc.queryForObject("select template_config from pages",String.class));
		assertThat(json.get("remoteTemplate").asString()).isEqualTo("spring-note");
		assertThat(json.get("paperAppearance").get("backgroundColor").asString()).isEqualTo("#FFFDF7");
		assertThat(jdbc.queryForObject("select template_id from pages",Long.class)).isEqualTo(templateId);
	}

	@Test void remoteTemplateIdsAreOnlyAcceptedOnRemoteTemplatesAndMustBeWellFormed() {
		remoteLandscapeTemplate();
		// 일반 속지에는 remoteTemplate 을 받지 않는다
		error(400,() -> tx.execute(s -> service.create(metadata(),List.of(new DiaryInitialPages.Selection("BLANK","1","{\"remoteTemplate\":\"spring-note\"}")))));
		noCreatedRows();
		// 원격 속지는 형식이 맞는 remoteTemplate 이 꼭 있어야 한다
		for (var config:List.of("{}","{\"remoteTemplate\":null}","{\"remoteTemplate\":123}","{\"remoteTemplate\":\"Spring Note\"}",
			"{\"remoteTemplate\":\"../x\"}","{\"remoteTemplate\":\""+"a".repeat(41)+"\"}")) {
			error(400,() -> tx.execute(s -> service.create(metadata(),List.of(new DiaryInitialPages.Selection("dio-remote-landscape","1.0.0",config)))));
			noCreatedRows();
		}
	}

	@Test void invalidCatalogDataFailsClosedAndAmbiguousCodesAreRejected() {
		jdbc.update("update page_templates set canvas_width=0 where template_id=-10");
		error(500,() -> tx.execute(s -> service.create(metadata(),selections(1)))); noCreatedRows();
		jdbc.update("update page_templates set canvas_width=1024 where template_id=-10");
		catalogDefaults("[]");
		error(500,() -> tx.execute(s -> service.create(metadata(),selections(1)))); noCreatedRows();
		catalogDefaults("{}");
		jdbc.update("insert into page_templates(template_id,code,template_version,name,category,orientation,canvas_width,canvas_height) values (-11,'BLANK','1','duplicate','BASIC','LANDSCAPE',1024,768)");
		error(400,() -> tx.execute(s -> service.create(metadata(),selections(1)))); noCreatedRows();
	}

    @Test void inactiveDuplicateCodeVersionDoesNotSilentlyChooseTheActiveRow() {
        jdbc.update("insert into page_templates(template_id,code,template_version,name,category,orientation,canvas_width,canvas_height,is_active) values (-11,'BLANK','1','different template','BASIC','LANDSCAPE',1024,768,false)");
        error(400,() -> tx.execute(s -> keyed(service).create("ambiguous-catalog-key",metadata(),selections(1))));
        noCreatedRows();
        assertThat(jdbc.queryForObject("select count(*) from diary_creation_receipts",Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from page_templates where code='BLANK' and template_version='1'",Long.class)).isEqualTo(2);
    }

    @Test void codeVersionResolvesTheActualPkInsteadOfReusingAnOldNumericId() {
        jdbc.update("update page_templates set template_id=987 where template_id=-10");
        jdbc.update("insert into page_templates(template_id,code,template_version,name,category,orientation,canvas_width,canvas_height) values (-10,'OTHER','1','other template','BASIC','LANDSCAPE',1024,768)");
        var result=tx.execute(s -> service.create(metadata(),selections(1)));
        assertThat(result.pageIds()).hasSize(1);
        assertThat(jdbc.queryForObject("select template_id from pages",Long.class)).isEqualTo(987);
        assertThat(jdbc.queryForObject("select code from page_templates where template_id=-10",String.class)).isEqualTo("OTHER");
    }

	@Test void realDatabaseFailureOnTheSecondPageRollsBackAndCanBeRetried() {
		jdbc.execute("alter table pages add constraint qa_second_page_failure check(sort_key<2)");
		assertThatThrownBy(() -> tx.execute(s -> service.create(metadata(),selections(2))))
			.isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
		noCreatedRows();
		jdbc.execute("alter table pages drop constraint qa_second_page_failure");
		var created=tx.execute(s -> service.create(metadata(),selections(2)));
		assertThat(created.pageIds()).hasSize(2);
		assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isEqualTo(1);
	}

	@Test void pageWriterRejectsCallsWithoutATransactionAndAppendingToAnExistingDiary() {
		assertThatThrownBy(() -> pages.validateSelections(selections(1))).isInstanceOf(IllegalStateException.class);
		assertThatThrownBy(() -> pages.create(UUID.randomUUID(),1,selections(1),AT)).isInstanceOf(IllegalStateException.class);
		noCreatedRows();
		var created=tx.execute(s -> service.create(metadata(),selections(1)));
		error(500,() -> tx.execute(s -> pages.create(UUID.fromString(created.diary().diaryId()),1,selections(1),AT)));
		assertThat(jdbc.queryForObject("select count(*) from pages",Long.class)).isEqualTo(1);
	}

	@Test void absentCatalogDoesNotCreateAnImplicitTemplateOrFallbackPage() {
		jdbc.update("delete from page_templates");
		error(400,() -> tx.execute(s -> service.create(metadata(),selections(1)))); noCreatedRows();
		assertThat(jdbc.queryForObject("select count(*) from page_templates",Long.class)).isZero();
	}

	class TestPages extends JdbcDiaryInitialPages {
		TestPages() { super(jdbc); }
	}

	IdempotentDiaryCreationService keyed(MemberDiaryCreationService producer) {
		return new IdempotentDiaryCreationService(actor::get,repository,new DiaryCreationReceiptRepository(jdbc,5000),producer);
	}
	void idempotencyError(String code,Runnable call) {
		assertThatThrownBy(call::run).isInstanceOfSatisfying(DiaryIdempotencyException.class,e -> assertThat(e.code()).isEqualTo(code));
	}
	@Test void sameKeyReplaysTheOriginalSnapshotAfterMetadataHasChanged() {
		var keyed=keyed(service);
		var first=tx.execute(s -> keyed.create("stable-key-0001",metadata(),selections(2)));
		var changedAt=first.created().diary().updatedAt().plusSeconds(60);
		jdbc.update("update diaries set title='later title',updated_at=?",Timestamp.from(changedAt));
		var replay=tx.execute(s -> keyed.create("stable-key-0001",metadata(),selections(2)));
		assertThat(first.replayed()).isFalse(); assertThat(replay.replayed()).isTrue();
		assertThat(replay.created()).isEqualTo(first.created());
		assertThat(replay.created().diary().updatedAt()).isNotEqualTo(changedAt);
		assertThat(jdbc.queryForObject("select updated_at from diaries",Timestamp.class).toInstant()).isEqualTo(changedAt);
		assertThat(jdbc.queryForObject("select title from diaries",String.class)).isEqualTo("later title");
		assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isEqualTo(1);
		assertThat(jdbc.queryForObject("select count(*) from diary_creation_receipts",Long.class)).isEqualTo(1);
	}
	@Test void canonicalObjectOrderAndNumberNotationReplayButChangedMetadataDoesNot() {
		var keyed=keyed(service);
		var a=List.of(new DiaryInitialPages.Selection("BLANK","1","{\"width\":1024,\"height\":768}"));
		var b=List.of(new DiaryInitialPages.Selection("BLANK","1","{\"height\":768.0,\"width\":1.024e3}"));
		var first=tx.execute(s -> keyed.create("canonical-key",metadata(),a));
		assertThat(tx.execute(s -> keyed.create("canonical-key",metadata(),b)).created()).isEqualTo(first.created());
		idempotencyError("IDEMPOTENCY_KEY_REUSED",() -> tx.execute(s -> keyed.create("canonical-key",new DiaryCreateRequest("changed",null,null,null),a)));
		assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isEqualTo(1);
	}
	@Test void changedPageOrderOrSettingsCannotReuseAKey() {
		var keyed=keyed(service);
		var a=new DiaryInitialPages.Selection("BLANK","1","{\"paperAppearance\":{\"backgroundColor\":\"#123456\"}}");
		var b=new DiaryInitialPages.Selection("BLANK","1","{\"paperAppearance\":{\"backgroundColor\":\"#654321\"}}");
		tx.execute(s -> keyed.create("ordered-pages-key",metadata(),List.of(a,b)));
		idempotencyError("IDEMPOTENCY_KEY_REUSED",() -> tx.execute(s -> keyed.create("ordered-pages-key",metadata(),List.of(b,a))));
		idempotencyError("IDEMPOTENCY_KEY_REUSED",() -> tx.execute(s -> keyed.create("ordered-pages-key",metadata(),List.of(a,a))));
	}
	@Test void keysAreScopedToTheAuthenticatedUserAndOnlyHashesAreStored() {
		var keyed=keyed(service);
		var a=tx.execute(s -> keyed.create("shared-user-key",metadata(),selections(1)));
		actor.set(2);
		var b=tx.execute(s -> keyed.create("shared-user-key",metadata(),selections(1)));
		assertThat(a.created().diary().diaryId()).isNotEqualTo(b.created().diary().diaryId());
		assertThat(jdbc.queryForObject("select count(*) from diary_creation_receipts",Long.class)).isEqualTo(2);
		assertThat(jdbc.queryForList("select key_hash from diary_creation_receipts",String.class)).allMatch(k -> k.matches("[a-f0-9]{64}") && !k.contains("shared-user-key"));
	}
	@Test void failedPageInsertRollsBackTheKeyAndCanRetryWithTheSameKey() {
		var failing=service(owner,new TestPages() {
			@Override public List<UUID> create(UUID id,long user,List<Selection> selected,Instant at) {
				super.create(id,user,selected,at); throw new IllegalStateException("page failure");
			}
		});
		assertThatThrownBy(() -> tx.execute(s -> keyed(failing).create("retry-page-key",metadata(),selections(2)))).isInstanceOf(IllegalStateException.class);
		noCreatedRows(); assertThat(jdbc.queryForObject("select count(*) from diary_creation_receipts",Long.class)).isZero();
		assertThat(tx.execute(s -> keyed(service).create("retry-page-key",metadata(),selections(2))).replayed()).isFalse();
	}
	@Test void failedReceiptCompletionRollsBackTheDiaryAndTheKey() {
		jdbc.execute("alter table diary_creation_receipts add constraint qa_receipt_failure check(response_body is null)");
		assertThatThrownBy(() -> tx.execute(s -> keyed(service).create("receipt-failure-key",metadata(),selections(2))))
			.isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
		noCreatedRows(); assertThat(jdbc.queryForObject("select count(*) from diary_creation_receipts",Long.class)).isZero();
		jdbc.execute("alter table diary_creation_receipts drop constraint qa_receipt_failure");
		assertThat(tx.execute(s -> keyed(service).create("receipt-failure-key",metadata(),selections(2))).replayed()).isFalse();
	}
	@Test void invalidKeysAndUnboundedNumericInputsCannotReserveReceipts() {
		for(String key:Arrays.asList(null,"short","contains spaces","x".repeat(129),"한글-key-123")) {
			assertThatThrownBy(() -> tx.execute(s -> keyed(service).create(key,metadata(),selections(1)))).isInstanceOf(DiaryIdempotencyException.class);
		}
		assertThatThrownBy(() -> tx.execute(s -> keyed(service).create("extreme-number-key",metadata(),List.of(new DiaryInitialPages.Selection("BLANK","1","{\"width\":1e999999}")))))
			.isInstanceOf(DiaryCreationException.class);
		assertThat(jdbc.queryForObject("select count(*) from diary_creation_receipts",Long.class)).isZero(); noCreatedRows();
	}
	@Test void deletionAndLostOwnershipNeverRecreateTheOriginalDiary() {
		var keyed=keyed(service); var first=tx.execute(s -> keyed.create("deleted-diary-key",metadata(),selections(1)));
		UUID id=UUID.fromString(first.created().diary().diaryId());
		jdbc.update("update diaries set deleted_at=? where diary_id=?",Timestamp.from(AT),id);
		idempotencyError("IDEMPOTENCY_RESULT_UNAVAILABLE",() -> tx.execute(s -> keyed.create("deleted-diary-key",metadata(),selections(1))));
		jdbc.update("update diaries set deleted_at=null where diary_id=?",id);
		jdbc.update("update diary_members set left_at=? where diary_id=?",Timestamp.from(AT),id);
		idempotencyError("IDEMPOTENCY_RESULT_UNAVAILABLE",() -> tx.execute(s -> keyed.create("deleted-diary-key",metadata(),selections(1))));
		jdbc.update("delete from pages where diary_id=?",id); jdbc.update("delete from diary_members where diary_id=?",id); jdbc.update("delete from diaries where diary_id=?",id);
		idempotencyError("IDEMPOTENCY_RESULT_UNAVAILABLE",() -> tx.execute(s -> keyed.create("deleted-diary-key",metadata(),selections(1))));
		assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isZero();
		assertThat(jdbc.queryForObject("select count(*) from diary_creation_receipts where diary_id is null",Long.class)).isEqualTo(1);
	}
	@Test void aCommittedReplayDoesNotDependOnTheTemplateStillBeingActive() {
		var keyed=keyed(service); var first=tx.execute(s -> keyed.create("catalog-change-key",metadata(),selections(1)));
		jdbc.update("update page_templates set is_active=false");
		assertThat(tx.execute(s -> keyed.create("catalog-change-key",metadata(),selections(1))).created()).isEqualTo(first.created());
		error(400,() -> tx.execute(s -> keyed.create("new-catalog-key",metadata(),selections(1))));
		assertThat(jdbc.queryForObject("select count(*) from diary_creation_receipts",Long.class)).isEqualTo(1);
	}
}
