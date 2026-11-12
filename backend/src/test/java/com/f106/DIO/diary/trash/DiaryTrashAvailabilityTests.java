package com.f106.DIO.diary.trash;
import java.time.Clock;
import java.util.List;
import com.f106.DIO.diary.auth.DiaryRequestIdentity;
import com.f106.DIO.diary.detail.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
@SuppressWarnings({"unchecked","rawtypes"})
class DiaryTrashAvailabilityTests {
 @Test void missingIcuAffectsOnlySearchAndDoesNotPreventPlainTrashListing() {
  var jdbc=mock(JdbcTemplate.class);
  when(jdbc.execute(any(ConnectionCallback.class))).thenReturn(true);
  when(jdbc.queryForObject(contains("pg_collation"),eq(Boolean.class))).thenReturn(false);
  doReturn(List.of()).when(jdbc).query(anyString(),any(RowMapper.class),any(Object[].class));
  var identity=mock(DiaryRequestIdentity.class);
  when(identity.requireUserId(any())).thenReturn(101L);
  var diaries=mock(DiaryDetailRepository.class);
  when(diaries.lockActiveUser(101L)).thenReturn(true);
  var service=com.f106.DIO.inventory.InventoryTestSupport.withQuotaMock(new DiaryTrashService(jdbc,identity,diaries,mock(DiaryMembershipAccess.class),Clock.systemUTC()));
  assertThatThrownBy(()->service.list("É",20,null)).isInstanceOfSatisfying(DiaryDetailException.class,e->{
   assertThat(e.status().value()).isEqualTo(503);
   assertThat(e.code()).isEqualTo("DIARY_TRASH_SEARCH_UNAVAILABLE");
  });
  assertThat(service.list(null,20,null).items()).isEmpty();
  verify(jdbc).query(anyString(),any(RowMapper.class),any(Object[].class));
 }
}
