package com.f106.DIO.user.repository;

import com.f106.DIO.user.domain.TermsAgreement;
import org.springframework.data.jpa.repository.JpaRepository;
public interface TermsAgreementRepository extends JpaRepository<TermsAgreement, TermsAgreement.Key> {}
