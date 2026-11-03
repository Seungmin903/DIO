package com.f106.DIO.user.dto;

import java.util.List;

public record TermsStatusResponse(List<TermsStatusItem> agreements) {
    public TermsStatusResponse {
        agreements = List.copyOf(agreements);
    }
}
