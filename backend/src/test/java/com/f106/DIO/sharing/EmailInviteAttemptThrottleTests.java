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
        throttle.reserve(diary," USER@example.com ",now);throttle.reserve(diary,"user@example.com",now);throttle.reserve(diary,"User@example.com",now);
        assertThatThrownBy(()->throttle.reserve(diary,"user@example.com",now)).isInstanceOf(SharingException.class);
        throttle.reserve(UUID.randomUUID(),"user@example.com",now);throttle.reserve(diary,"other@example.com",now);
        throttle.reserve(diary,"user@example.com",now.plusSeconds(300));
    }
    @Test void parallelAttemptsCannotExceedThreeForOneDiaryAndEmail() throws Exception {
        var throttle=new EmailInviteAttemptThrottle();UUID diary=UUID.randomUUID();Instant now=Instant.now();
        var pool=Executors.newFixedThreadPool(8);var start=new CountDownLatch(1);
        try {
            var results=new ArrayList<Future<Boolean>>();
            for(int i=0;i<20;i++)results.add(pool.submit(()->{start.await();try{throttle.reserve(diary,"user@example.com",now);return true;}catch(SharingException error){return false;}}));
            start.countDown();int allowed=0;for(var result:results)if(result.get(10,TimeUnit.SECONDS))allowed++;
            assertThat(allowed).isEqualTo(3);
        } finally {start.countDown();pool.shutdownNow();}
    }
}
