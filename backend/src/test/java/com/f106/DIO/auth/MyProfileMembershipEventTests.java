package com.f106.DIO.auth;

import static org.assertj.core.api.Assertions.assertThat;
import com.f106.DIO.auth.service.MyProfileService;
import org.junit.jupiter.api.Test;

class MyProfileMembershipEventTests {
    @Test void membershipEventIsPublishedOnlyWhenVisibleAccountProfileChanges(){
        assertThat(MyProfileService.membershipAppearanceChanged(true,false,false)).isTrue();
        assertThat(MyProfileService.membershipAppearanceChanged(false,true,false)).isTrue();
        assertThat(MyProfileService.membershipAppearanceChanged(false,false,true)).isTrue();
        assertThat(MyProfileService.membershipAppearanceChanged(false,false,false)).isFalse();
    }
}
