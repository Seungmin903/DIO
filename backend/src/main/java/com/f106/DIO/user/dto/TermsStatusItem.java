package com.f106.DIO.user.dto;

import java.time.Instant;
import com.f106.DIO.user.domain.TermsRecordStatus;
import com.f106.DIO.user.domain.TermsType;

public record TermsStatusItem(TermsType termsType, String termsVersion, boolean agreed,
                              Instant agreedAt, TermsRecordStatus recordStatus) {}
