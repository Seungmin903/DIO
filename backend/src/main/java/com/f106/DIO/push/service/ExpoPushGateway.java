package com.f106.DIO.push.service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/** Expo 전송 경계. 활성화하지 않으면 어떤 네트워크 호출도 하지 않는다. */
@Component
public class ExpoPushGateway {
    private final boolean enabled;
    private final HttpClient client;
    private final URI endpoint;
    private final ObjectMapper json;
    private final String accessToken;
    @org.springframework.beans.factory.annotation.Autowired
    public ExpoPushGateway(@Value("${dio.push.delivery.enabled:false}") boolean enabled, ObjectMapper json, @Value("${dio.push.expo-access-token:}") String accessToken) {
        this(enabled, json, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build(), URI.create("https://exp.host/--/api/v2/push/send"),accessToken);
    }
    ExpoPushGateway(boolean enabled, ObjectMapper json, HttpClient client, URI endpoint) { this(enabled,json,client,endpoint,""); }
    ExpoPushGateway(boolean enabled, ObjectMapper json, HttpClient client, URI endpoint, String accessToken) {
        this.enabled=enabled;this.json=json;this.client=client;this.endpoint=endpoint;this.accessToken=accessToken;
    }
    private HttpRequest.Builder request(URI uri) {
        var builder=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10)).header("Content-Type","application/json").header("Accept","application/json");
        if(accessToken!=null && !accessToken.isBlank())builder.header("Authorization","Bearer "+accessToken);
        return builder;
    }
    public Result sendInvitation(String token, String inviteId) throws Exception {
        if (!enabled) throw new IllegalStateException("푸시 발송이 비활성화되어 있습니다.");
        if (token==null || !token.matches("(?:ExpoPushToken|ExponentPushToken)\\[[A-Za-z0-9_-]+\\]") || inviteId==null || !inviteId.matches("[1-9][0-9]{0,18}")) throw new IllegalArgumentException("유효하지 않은 푸시 대상입니다.");
        String body=json.writeValueAsString(Map.of("to",token,"title","다이어리 초대가 도착했어요", "body","함께 쓸 다이어리 초대를 확인해 보세요.","data",Map.of("type","DIARY_INVITE","inviteId",inviteId)));
        var request=request(endpoint).POST(HttpRequest.BodyPublishers.ofString(body)).build();
        var response=client.send(request,HttpResponse.BodyHandlers.ofString());
        if(response.statusCode()!=200) return new Result(false,null,"HTTP_"+response.statusCode());
        var data=json.readTree(response.body()).path("data");
        if(data.isArray())data=data.path(0);
        String status=data.path("status").asText();
        if("ok".equals(status)) {String ticket=data.path("id").asText();return !ticket.matches("[A-Za-z0-9_-]{1,128}")?new Result(false,null,"INVALID_RESPONSE"):new Result(true,ticket,null);}
        String code=data.path("details").path("error").asText();
        return new Result(false,null,safeCode(code));
    }
    /** Expo 접수 후 비동기 receipt를 조회한다. ready=false는 나중에 다시 조회한다. */
    public Receipt receipt(String ticketId) throws Exception {
        if (!enabled) throw new IllegalStateException("푸시 발송이 비활성화되어 있습니다.");
        if(ticketId==null || !ticketId.matches("[A-Za-z0-9_-]{1,128}")) throw new IllegalArgumentException("유효하지 않은 접수 ID입니다.");
        URI uri=endpoint.resolve("/--/api/v2/push/getReceipts");
        var request=request(uri).POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(Map.of("ids",java.util.List.of(ticketId))))).build();
        var response=client.send(request,HttpResponse.BodyHandlers.ofString());
        if(response.statusCode()!=200) return new Receipt(false,false,"HTTP_"+response.statusCode());
        var receipt=json.readTree(response.body()).path("data").path(ticketId);
        String status=receipt.path("status").asText();
        if(status.isBlank()) return new Receipt(false,false,null);
        if("ok".equals(status)) return new Receipt(true,true,null);
        String code=receipt.path("details").path("error").asText();
        return new Receipt(true,false,safeCode(code));
    }
    private static String safeCode(String code) { return code!=null && code.matches("[A-Za-z0-9_]{1,80}") ? code : "PROVIDER_ERROR"; }
    public record Receipt(boolean ready,boolean delivered,String code) {}
    public record Result(boolean accepted,String ticketId,String code) {}
}
