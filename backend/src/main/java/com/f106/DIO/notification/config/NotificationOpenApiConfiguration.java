package com.f106.DIO.notification.config;

import java.util.Set;
import java.util.List;

import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.media.ComposedSchema;
import io.swagger.v3.oas.models.media.Schema;

@Configuration
public class NotificationOpenApiConfiguration {
    @Bean
    OpenApiCustomizer notificationErrorResponses() {
        return api -> {
            if (api.getComponents() == null || api.getComponents().getSchemas() == null || api.getPaths() == null
                || !api.getPaths().keySet().containsAll(List.of("/api/v1/notifications", "/api/v1/notifications/unread-count", "/api/v1/notifications/{notificationId}"))) return;
            var schemas = api.getComponents().getSchemas();
            schemas.put("NotificationBadRequestProblem", problem(400, false,
                List.of("INVALID_NOTIFICATION_LIMIT", "INVALID_NOTIFICATION_CURSOR")));
            schemas.put("NotificationAuthenticationProblem", problem(401, true, List.of("AUTHENTICATION_REQUIRED")));
            schemas.put("NotificationNotFoundProblem", problem(404, false, List.of("NOTIFICATION_NOT_FOUND")));
            schemas.put("NotificationParameterProblem", problem(400, false, List.of()));
            var list = api.getPaths().get("/api/v1/notifications").getGet();
            var count = api.getPaths().get("/api/v1/notifications/unread-count").getGet();
            var item = api.getPaths().get("/api/v1/notifications/{notificationId}");
            for (var operation : List.of(list, count, item.getPatch(), item.getDelete())) {
                operation.getResponses().addApiResponse("401", error("NotificationAuthenticationProblem",
                    "미인증: code=AUTHENTICATION_REQUIRED. JWT 연결 전에도 동일한401."));
            }
            list.getResponses().addApiResponse("400", error("NotificationBadRequestProblem",
                "범위 오류 INVALID_NOTIFICATION_LIMIT, 잘못된 커서 INVALID_NOTIFICATION_CURSOR. Spring 타입 변환 오류는 code 필드 없음."));
            for (var operation : List.of(item.getPatch(), item.getDelete())) {
                operation.getResponses().addApiResponse("400", error("NotificationParameterProblem", "알림 ID 타입/범위 변환 오류. code 필드 없음."));
                operation.getResponses().addApiResponse("404", error("NotificationNotFoundProblem",
                    "타인/없는 알림은 NOTIFICATION_NOT_FOUND. 읽음은 삭제된 알림도404. 경로 미매칭404는 code가 없을 수 있음."));
            }
        };
    }

    private static Schema<?> problem(int status, boolean requireCode, List<String> codes) {
        var schema = new io.swagger.v3.oas.models.media.ObjectSchema();
        schema.addProperty("type", new io.swagger.v3.oas.models.media.StringSchema().format("uri")
            .description("기본 about:blank이면 실제 Spring 응답에서 생략됨"));
        schema.addProperty("title", new io.swagger.v3.oas.models.media.StringSchema());
        var statusSchema = new io.swagger.v3.oas.models.media.IntegerSchema();
        statusSchema.setEnum(List.of(status));
        schema.addProperty("status", statusSchema);
        schema.addProperty("detail", new io.swagger.v3.oas.models.media.StringSchema());
        schema.addProperty("instance", new io.swagger.v3.oas.models.media.StringSchema().format("uri-reference"));
        if (!codes.isEmpty()) {
            var code = new io.swagger.v3.oas.models.media.StringSchema();
            code.setEnum(codes);
            schema.addProperty("code", code);
        }
        schema.setRequired(requireCode ? List.of("title", "status", "detail", "instance", "code")
            : List.of("title", "status", "detail", "instance"));
        return schema;
    }

    private static io.swagger.v3.oas.models.responses.ApiResponse error(String schema, String description) {
        return new io.swagger.v3.oas.models.responses.ApiResponse().description(description).content(
            new io.swagger.v3.oas.models.media.Content().addMediaType("application/problem+json",
                new io.swagger.v3.oas.models.media.MediaType().schema(new Schema<>().$ref("#/components/schemas/" + schema))));
    }

    @Bean
    OpenApiCustomizer nullableNotificationInvitation() {
        return api -> {
            if (api.getComponents() == null || api.getComponents().getSchemas() == null) return;
            var schemas = api.getComponents().getSchemas();
            Schema<?> list = schemas.get("NotificationListResponse");
            if (list == null || list.getProperties() == null) return;
            Schema<?> items = list.getProperties().get("items");
            if (items == null || items.getItems() == null || items.getItems().get$ref() == null) return;
            String itemRef = items.getItems().get$ref();
            Schema<?> item = schemas.get(itemRef.substring(itemRef.lastIndexOf('/') + 1));
            if (item == null || item.getProperties() == null) return;
            Schema<?> invitation = item.getProperties().get("invitation");
            if (invitation == null || invitation.get$ref() == null) return;
            // $ref 형제 type/nullable로는 참조 대상의 object 제약을 해제할 수 없다.
            Schema<Object> nullValue = new Schema<>();
            nullValue.setTypes(Set.of("null"));
            var nullable = new ComposedSchema();
            nullable.addAnyOfItem(new Schema<>().$ref(invitation.get$ref()));
            nullable.addAnyOfItem(nullValue);
            nullable.setDescription(invitation.getDescription());
            item.addProperty("invitation", nullable);
        };
    }
}
