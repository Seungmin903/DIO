package com.f106.DIO.diary.http;

import java.util.List;
import com.f106.DIO.diary.auth.DiaryRequestIdentity;
import com.f106.DIO.diary.detail.DiaryDetailException;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

@SuppressWarnings({"unchecked","rawtypes"})
class MemberDiaryListAvailabilityTests {
    JdbcTemplate postgres() {
        var jdbc=mock(JdbcTemplate.class);
        when(jdbc.execute(any(ConnectionCallback.class))).thenReturn(true);
        when(jdbc.queryForObject(anyString(),eq(Boolean.class))).thenReturn(false);
        doReturn(List.of()).when(jdbc).query(anyString(),any(RowMapper.class),any(Object[].class));
        return jdbc;
    }
    DiaryRequestIdentity identity() {
        var identity=mock(DiaryRequestIdentity.class);
        when(identity.requireUserId(any())).thenReturn(101L);return identity;
    }
    @Test void missingIcuDoesNotPreventContextStartupAndListFailsWith503() {
        var jdbc=postgres();
        try(var context=new AnnotationConfigApplicationContext()) {
            context.registerBean(JdbcTemplate.class,()->jdbc);
            context.registerBean(DiaryRequestIdentity.class,this::identity);
            context.registerBean(MemberDiaryListQuery.class);
            context.refresh();
            verify(jdbc,never()).queryForObject(anyString(),eq(Boolean.class));
            var lists=context.getBean(MemberDiaryListQuery.class);
            assertThatThrownBy(()->lists.list(null,"title",20,null))
                .isInstanceOfSatisfying(DiaryDetailException.class,e->{
                    assertThat(e.status()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                    assertThat(e.code()).isEqualTo("DIARY_LIST_UNAVAILABLE");
                });
            verify(jdbc,never()).query(anyString(),any(RowMapper.class),any(Object[].class));
        }
    }
    @Test void unfilteredDateAndPageListsRemainAvailableWithoutIcu() {
        var jdbc=postgres();var lists=new MemberDiaryListQuery(jdbc,identity());
        for(String sort:List.of("created","updated","pages")) assertThat(lists.list(null,sort,20,null).items()).isEmpty();
        verify(jdbc,never()).queryForObject(anyString(),eq(Boolean.class));
        verify(jdbc,never()).query(contains("und-x-icu"),any(RowMapper.class),any(Object[].class));
        assertThatThrownBy(()->lists.list("É","created",20,null)).isInstanceOf(DiaryDetailException.class);
    }
    @Test void restoredIcuCanBeRetriedWithoutRestartAndNeverFallsBackToAscii() {
        var jdbc=postgres();var lists=new MemberDiaryListQuery(jdbc,identity());
        when(jdbc.queryForObject(anyString(),eq(Boolean.class))).thenReturn(false,true);
        assertThatThrownBy(()->lists.list(null,"title",20,null)).isInstanceOf(DiaryDetailException.class);
        assertThat(lists.list(null,"title",20,null).items()).isEmpty();
        verify(jdbc).query(contains("und-x-icu"),any(RowMapper.class),any(Object[].class));
    }
    @Test void authenticationAndInputValidationPrecedeTheCapabilityCheck() {
        var jdbc=postgres();var identity=identity();var lists=new MemberDiaryListQuery(jdbc,identity);
        doThrow(DiaryDetailException.unauthorized()).when(identity).requireUserId(any());
        assertThatThrownBy(()->lists.list(null,null,20,null))
            .isInstanceOfSatisfying(DiaryDetailException.class,e->assertThat(e.status()).isEqualTo(HttpStatus.UNAUTHORIZED));
        doReturn(101L).when(identity).requireUserId(any());
        assertThatThrownBy(()->lists.list(null,"invalid",20,null)).isInstanceOf(MemberDiaryRequestException.class);
        verify(jdbc,never()).queryForObject(anyString(),eq(Boolean.class));
    }
}
