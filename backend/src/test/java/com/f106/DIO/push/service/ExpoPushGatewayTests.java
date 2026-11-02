package com.f106.DIO.push.service;

import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;

class ExpoPushGatewayTests {
 @Test void disabledNeverCallsAndFakeEndpointReceivesMinimalPayload() throws Exception {
  var server=com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1",0),0);
  var input=new AtomicReference<String>();
  server.createContext("/send",exchange->{input.set(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));byte[] body="{\"data\":{\"status\":\"ok\",\"id\":\"ticket-1\"}}".getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(200,body.length);exchange.getResponseBody().write(body);exchange.close();});
  server.createContext("/--/api/v2/push/getReceipts",exchange->{byte[] body="{\"data\":{\"ticket-1\":{\"status\":\"error\",\"details\":{\"error\":\"DeviceNotRegistered\"}}}}".getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(200,body.length);exchange.getResponseBody().write(body);exchange.close();});
  server.start();
  try {
   var endpoint=URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/send");var json=new ObjectMapper();var client=HttpClient.newHttpClient();
   assertThatThrownBy(()->new ExpoPushGateway(false,json,client,endpoint).sendInvitation("ExpoPushToken[fake]","123")).isInstanceOf(IllegalStateException.class);
   assertThat(input.get()).isNull();
   var result=new ExpoPushGateway(true,json,client,endpoint).sendInvitation("ExpoPushToken[fake]","123");
   assertThat(result.accepted()).isTrue();assertThat(result.ticketId()).isEqualTo("ticket-1");
   assertThat(input.get()).contains("DIARY_INVITE", "123").doesNotContain("installationSecret");
   var receipt=new ExpoPushGateway(true,json,client,endpoint).receipt("ticket-1");
   assertThat(receipt.ready()).isTrue();assertThat(receipt.delivered()).isFalse();assertThat(receipt.code()).isEqualTo("DeviceNotRegistered");
  } finally {server.stop(0);}
 }
}
