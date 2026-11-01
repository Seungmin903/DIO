package com.f106.DIO.auth.integration;
import com.f106.DIO.user.domain.User;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.*;
class UserWithdrawalNicknameTests {
    @Test void anonymizedKeyCannotBeEnteredAsANicknameAndFitsTheColumn(){
        for(long id:new long[]{5,Long.MAX_VALUE}){
            var user=new User("test@example.com","회원",Instant.now());
            ReflectionTestUtils.setField(user,"userId",id);user.withdraw(Instant.now());
            assertThat(user.getNicknameKey()).doesNotMatch("[가-힣a-zA-Z0-9_]{2,12}").hasSizeLessThanOrEqualTo(30);
            assertThat(user.getNicknameKey()).isNotEqualTo("withdrawn_"+id);
        }
    }
}
