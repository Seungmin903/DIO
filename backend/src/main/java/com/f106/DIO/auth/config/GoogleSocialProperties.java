package com.f106.DIO.auth.config;

import java.util.List;
import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public record GoogleSocialProperties(List<String> clientIds) {
    public GoogleSocialProperties { clientIds=List.copyOf(clientIds); }
    public static List<String> parse(String value) {
        return Arrays.stream(value.split(",")).map(String::strip).filter(s->!s.isEmpty()).distinct().toList();
    }
    @org.springframework.beans.factory.annotation.Autowired
    public GoogleSocialProperties(@Value("${dio.auth.google.client-ids:}") String value) {this(parse(value));}
}
