package com.f106.DIO.page.repository;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import com.f106.DIO.page.domain.PageTemplate;
public interface PageTemplateRepository extends JpaRepository<PageTemplate, Long> {
	Optional<PageTemplate> findByTemplateIdAndIsActiveTrue(Long templateId);
	/** 앱이 설정에 적어 보낸 속지 코드 · 버전의 활성 행. 같은 코드 · 버전 행이 여럿이면 호출자가 거부한다 */
	List<PageTemplate> findAllByCodeAndTemplateVersionAndIsActiveTrue(String code,String templateVersion);
}
