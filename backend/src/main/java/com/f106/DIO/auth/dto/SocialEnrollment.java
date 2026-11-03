package com.f106.DIO.auth.dto;
import com.f106.DIO.user.dto.Agreement;
import com.f106.DIO.user.support.UserInput;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
/** New member input only; the email and provider subject never come from this DTO. */
public record SocialEnrollment(
    @NotBlank @Pattern(regexp="[가-힣A-Za-z0-9_]{2,12}") String nickname,
    @NotNull @AssertTrue Boolean ageConfirmed,
    @NotNull @Size(min=2,max=7) List<@NotNull @Valid Agreement> agreements) {
    public SocialEnrollment {nickname=UserInput.normalizeNickname(nickname);agreements=agreements==null?null:java.util.Collections.unmodifiableList(new java.util.ArrayList<>(agreements));}
    @Override public String toString(){return "SocialEnrollment[personalData=REDACTED]";}
}
