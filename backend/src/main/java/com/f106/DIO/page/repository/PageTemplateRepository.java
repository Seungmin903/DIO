package com.f106.DIO.page.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.f106.DIO.page.domain.PageTemplate;

public interface PageTemplateRepository extends JpaRepository<PageTemplate, Long> {
	Optional<PageTemplate> findByTemplateIdAndIsActiveTrue(Long templateId);
}
