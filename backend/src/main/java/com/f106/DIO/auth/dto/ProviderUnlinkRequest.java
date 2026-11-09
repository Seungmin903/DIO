package com.f106.DIO.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Fresh provider proof prevents a stolen member session from removing sign-in methods. */
public record ProviderUnlinkRequest(@NotBlank @Size(max=16384) String idToken) {
    @Override public String toString(){ return "ProviderUnlinkRequest[credentials=REDACTED]"; }
}
