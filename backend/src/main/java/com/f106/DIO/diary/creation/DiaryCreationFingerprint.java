package com.f106.DIO.diary.creation;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import com.f106.DIO.diary.dto.DiaryCreateRequest;
import tools.jackson.core.JacksonException;
import tools.jackson.core.StreamReadConstraints;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.json.JsonFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/** v1: 객체 키 순서·숫자 표기는 정규화하고 페이지 배열 순서는 유지한다. */
final class DiaryCreationFingerprint {
    private static final JsonMapper JSON=JsonMapper.builder(JsonFactory.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
        .streamReadConstraints(StreamReadConstraints.builder().maxNestingDepth(16).maxStringLength(16384).build()).build())
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();

    static String key(String value) {
        if(value==null) throw DiaryIdempotencyException.invalid("MISSING_IDEMPOTENCY_KEY");
        if(!value.matches("[A-Za-z0-9][A-Za-z0-9._:-]{7,127}")) throw DiaryIdempotencyException.invalid("INVALID_IDEMPOTENCY_KEY");
        return hash(value);
    }
    static String request(DiaryCreateRequest metadata,List<DiaryInitialPages.Selection> pages) {
        return request(metadata,pages,null);
    }
    static String request(DiaryCreateRequest metadata,List<DiaryInitialPages.Selection> pages,JsonNode paperAppearance) {
        if(metadata==null || pages==null || pages.isEmpty() || pages.size()>4096) throw DiaryCreationException.invalid();
        var root=JSON.createObjectNode(); root.put("format","diary-create-v1");
        root.put("title",metadata.diaryTitle()); root.put("color",metadata.coverColor()); root.put("style",metadata.coverStyle()); root.put("visibility",metadata.visibility());
        if(paperAppearance!=null)root.set("paperAppearance",paperAppearance);
        var array=root.putArray("pages");
        for(var page:pages) {
            if(page==null || page.configurationJson().length()>16384) throw DiaryCreationException.invalid();
            JsonNode config;
            try { config=JSON.readTree(page.configurationJson()); }
            catch(JacksonException invalid) { throw DiaryCreationException.invalid(); }
            if(config==null || !config.isObject()) throw DiaryCreationException.invalid();
            var item=array.addObject(); item.put("code",page.templateCode()); item.put("version",page.templateVersion()); item.set("config",config);
        }
        try { return hash(canonical(root)); }
        catch(ArithmeticException | NumberFormatException | JacksonException invalidNumber) { throw DiaryCreationException.invalid(); }
    }
    private static String canonical(JsonNode value) {
        if(value.isObject()) {
            var out=new StringBuilder("{");
            value.properties().stream().sorted(Map.Entry.comparingByKey()).forEach(e -> out.append(JSON.writeValueAsString(e.getKey())).append(':').append(canonical(e.getValue())).append(','));
            return out.append('}').toString();
        }
        if(value.isArray()) {
            var out=new StringBuilder("[");
            for(int i=0;i<value.size();i++) out.append(canonical(value.get(i))).append(',');
            return out.append(']').toString();
        }
        if(value.isNumber()) {
            var number=value.decimalValue().stripTrailingZeros();
            if(Math.abs((long)number.scale())>100 || number.precision()>100) throw DiaryCreationException.invalid();
            return number.toPlainString();
        }
        return value.toString();
    }
    private static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch(NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
