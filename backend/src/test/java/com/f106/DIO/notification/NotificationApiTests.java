package com.f106.DIO.notification;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
	"spring.datasource.url=jdbc:h2:mem:notifications;MODE=PostgreSQL",
	"spring.sql.init.mode=always", "spring.sql.init.schema-locations=classpath:notification-h2.sql"
})
@Transactional
class NotificationApiTests extends NotificationContract {

	@org.junit.jupiter.api.Test
	void documentsNotificationRoutesWithoutAClientSuppliedUserId() throws Exception {
		mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/v3/api-docs"))
			.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
			.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.paths['/api/v1/notifications'].get").exists())
			.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.paths['/api/v1/notifications/unread-count'].get").exists())
			.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.paths['/api/v1/notifications/{notificationId}/read'].patch").exists())
			.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.paths['/api/v1/notifications'].get.parameters.length()").value(2));
	}
}
