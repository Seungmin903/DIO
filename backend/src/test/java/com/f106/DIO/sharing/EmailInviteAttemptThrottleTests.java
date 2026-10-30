package com.f106.DIO.sharing;
import com.f106.DIO.sharing.support.EmailInviteAttemptThrottle;
import com.f106.DIO.sharing.exception.SharingException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class EmailInviteAttemptThrottleTests {
    @Test void normalizedEmailSharesOneBudgetAndTheWindowExpires() {
        var throttle=new EmailInviteAttemptThrottle();UUID diary=UUID.randomUUID();Instant now=Instant.now();
        throttle.reserve(diary,1L," USER@example.com ",now);throttle.reserve(diary,1L,"user@example.com",now);throttle.reserve(diary,1L,"User@example.com",now);
        assertThatThrownBy(()->throttle.reserve(diary,1L,"user@example.com",now)).isInstanceOf(SharingException.class);
        throttle.reserve(UUID.randomUUID(),1L,"user@example.com",now);throttle.reserve(diary,1L,"other@example.com",now);
        throttle.reserve(diary,1L,"user@example.com",now.plusSeconds(300));
    }
    @Test void parallelAttemptsCannotExceedThreeForOneDiaryAndEmail() throws Exception {
        var throttle=new EmailInviteAttemptThrottle();UUID diary=UUID.randomUUID();Instant now=Instant.now();
        var pool=Executors.newFixedThreadPool(8);var start=new CountDownLatch(1);
        try {
            var results=new ArrayList<Future<Boolean>>();
            for(int i=0;i<20;i++)results.add(pool.submit(()->{start.await();try{throttle.reserve(diary,1L,"user@example.com",now);return true;}catch(SharingException error){return false;}}));
            start.countDown();int allowed=0;for(var result:results)if(result.get(10,TimeUnit.SECONDS))allowed++;
            assertThat(allowed).isEqualTo(3);
        } finally {start.countDown();pool.shutdownNow();}
    }
    @Test void changingEmailOrDiaryCannotBypassTheRequestersMinuteBudget() {
        var throttle=new EmailInviteAttemptThrottle();Instant now=Instant.now();
        for(int i=0;i<20;i++)throttle.reserve(UUID.randomUUID(),7L,"different-"+i+"@example.com",now);
        assertThatThrownBy(()->throttle.reserve(UUID.randomUUID(),7L,"next@example.com",now))
            .isInstanceOfSatisfying(SharingException.class,e->assertThat(e.code).isEqualTo("EMAIL_INVITE_ACTOR_RATE_LIMITED"));
        throttle.reserve(UUID.randomUUID(),8L,"next@example.com",now);
        throttle.reserve(UUID.randomUUID(),7L,"next@example.com",now.plusSeconds(60));
    }
    @Test void saturatedCachesEvictOldWindowsWithoutBlockingOtherUsers() {
        var throttle=new EmailInviteAttemptThrottle();UUID diary=UUID.randomUUID();Instant now=Instant.now();
        for(int i=0;i<20000;i++)throttle.reserve(diary,i+1L,"recipient-"+i+"@example.com",now);
        throttle.reserve(UUID.randomUUID(),50000L,"new-user@example.com",now);
        var windows=(Map<?,?>)org.springframework.test.util.ReflectionTestUtils.getField(throttle,"windows");
        var actors=(Map<?,?>)org.springframework.test.util.ReflectionTestUtils.getField(throttle,"actors");
        assertThat(windows).hasSize(20000);assertThat(actors).hasSize(20000);
    }
}
