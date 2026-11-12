package com.f106.DIO.inventory;

import java.util.List;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.*;
import io.swagger.v3.oas.models.media.*;
import io.swagger.v3.oas.models.responses.ApiResponse;

@Configuration
public class InventoryOpenApiConfiguration {
    @Bean OpenApiCustomizer inventoryLimitResponses(){
        return api->{
            if(api.getPaths()==null)return;
            if(api.getComponents()==null)api.setComponents(new io.swagger.v3.oas.models.Components());
            var schema=new ObjectSchema();
            schema.addProperty("status",new IntegerSchema().example(409));
            schema.addProperty("title",new StringSchema());
            schema.addProperty("detail",new StringSchema());
            schema.addProperty("code",new StringSchema()._enum(List.of("INVENTORY_LIMIT_REACHED")));
            schema.addProperty("limitType",new StringSchema()._enum(java.util.Arrays.stream(InventoryLimits.Kind.values()).map(Enum::name).toList()));
            for(String key:List.of("currentCount","maxCount","requestedCount"))schema.addProperty(key,new IntegerSchema().format("int64"));
            schema.setRequired(List.of("status","code","limitType","currentCount","maxCount","requestedCount"));
            api.getComponents().addSchemas("InventoryLimitProblem",schema);
            api.getPaths().forEach((path,item)->item.readOperationsMap().forEach((method,operation)->{
                boolean limited=switch(method){
                    case POST -> List.of("/api/v1/media","/api/v1/diaries","/api/v1/member/diaries","/api/v1/member/diaries/{diaryId}/restore",
                        "/api/v1/diaries/{diaryId}/pages","/api/v1/pages/{pageId}/copies","/api/v1/diaries/{diaryId}/invites",
                        "/api/v1/diaries/{diaryId}/invites/email","/api/v1/invites/{token}/accept","/api/v1/sticker-cutouts/{cutoutId}/save").contains(path);
                    case PUT -> List.of("/api/v1/me/sticker-library","/api/v1/me/tape-library").contains(path);
                    case PATCH -> "/api/v1/diaries/{diaryId}".equals(path);
                    default -> false;
                };
                if(!limited)return;
                var previous=operation.getResponses().get("409");
                var response=previous==null?new ApiResponse():previous;
                response.setDescription((previous==null?"":previous.getDescription()+" / ")+"보유 한도 초과: INVENTORY_LIMIT_REACHED. 종류·현재 수·최대 수·추가 수를 반환합니다.");
                var type=new MediaType().schema(new Schema<>().$ref("#/components/schemas/InventoryLimitProblem"));
                if(response.getContent()==null)response.setContent(new Content());
                var old=response.getContent().get("application/problem+json");
                if(old!=null&&old.getSchema()!=null)type.schema(new ComposedSchema().addAnyOfItem(old.getSchema()).addAnyOfItem(type.getSchema()));
                response.getContent().addMediaType("application/problem+json",type);
                operation.getResponses().addApiResponse("409",response);
            }));
        };
    }
}
