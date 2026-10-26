package com.f106.DIO.auth.signup;

import java.time.*;
import java.util.concurrent.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class SignupMailThrottleTests {
    static class MutableClock extends Clock {
        Instant now=Instant.parse("2026-10-26T00:00:00Z");
        public ZoneId getZone(){return ZoneOffset.UTC;}
        public Clock withZone(ZoneId zone){return this;}
        public Instant instant(){return now;}
    }
    @Test void blocksTwentyFirstRequestAndReturnsRemainingWindow() {
        var clock=new MutableClock();var throttle=new SignupMailThrottle(clock);
        for(int i=0;i<20;i++)throttle.check("192.0.2.1");
        assertThatThrownBy(()->throttle.check("192.0.2.1")).isInstanceOfSatisfying(SignupException.class,error->{
            assertThat(error.code).isEqualTo("SIGNUP_MAIL_IP_RATE_LIMITED");assertThat(error.retryAfterSeconds).isEqualTo(900);
        });
        clock.now=clock.now.plusSeconds(61);
        assertThatThrownBy(()->throttle.check("192.0.2.1")).isInstanceOfSatisfying(SignupException.class,error->assertThat(error.retryAfterSeconds).isEqualTo(839));
        clock.now=clock.now.plusSeconds(839);throttle.check("192.0.2.1");
    }
    @Test void anotherAddressHasItsOwnBudget() {
        var throttle=new SignupMailThrottle();
        for(int i=0;i<20;i++)throttle.check("192.0.2.1");
        throttle.check("192.0.2.2");
        assertThatThrownBy(()->throttle.check("192.0.2.1")).isInstanceOf(SignupException.class);
    }
    @Test void concurrentRequestsCannotExceedBudget() throws Exception {
        var throttle=new SignupMailThrottle();var pool=Executors.newFixedThreadPool(8);var start=new CountDownLatch(1);
        try {
            var futures=new ArrayList<Future<Boolean>>();
            for(int i=0;i<40;i++)futures.add(pool.submit(()->{start.await();try{throttle.check("192.0.2.1");return true;}catch(SignupException error){return false;}}));
            start.countDown();int accepted=0;for(var future:futures)if(future.get(5,TimeUnit.SECONDS))accepted++;
            assertThat(accepted).isEqualTo(20);
        } finally {pool.shutdownNow();}
    }
}
