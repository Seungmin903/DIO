package com.f106.DIO.user.repository;

import com.f106.DIO.user.domain.TermsAgreement;
import org.springframework.data.jpa.repository.JpaRepository;
public interface TermsAgreementRepository extends JpaRepository<TermsAgreement, TermsAgreement.Key> {
    java.util.List<TermsAgreement> findByUserIdAndTermsTypeIn(Long userId, java.util.Collection<String> termsTypes);
}
