package com.f106.DIO.collaboration.service;
import com.f106.DIO.collaboration.domain.CanvasElementSnapshot;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import org.springframework.stereotype.Component;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;
@Component
public class CanvasHistoryCodec {
    private final ObjectMapper json;
    public CanvasHistoryCodec(ObjectMapper json){this.json=json;}
    public ObjectNode object(){return json.createObjectNode();}
    public ObjectNode read(String text){var node=json.readTree(text);if(node.isTextual())node=json.readTree(node.asText());return (ObjectNode)node;}
    public Map<String,CanvasElementSnapshot> states(JsonNode node){
        var states=new LinkedHashMap<String,CanvasElementSnapshot>();
        node.properties().forEach(e->states.put(e.getKey(),e.getValue().isNull()?null:json.treeToValue(e.getValue(),CanvasElementSnapshot.class)));
        return states;
    }
    public JsonNode tree(Object value){return json.valueToTree(value);}
    public String hash(Object value){
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(normalized(tree(value)).getBytes(StandardCharsets.UTF_8)));}
        catch(NoSuchAlgorithmException impossible){throw new IllegalStateException(impossible);}
    }
    private String normalized(JsonNode node){
        if(node.isNumber())return "N"+node.decimalValue().stripTrailingZeros().toPlainString();
        if(node.isObject())return "{"+node.properties().stream().sorted(Map.Entry.comparingByKey())
            .map(e->json.writeValueAsString(e.getKey())+":"+normalized(e.getValue())).collect(java.util.stream.Collectors.joining(","))+"}";
        if(node.isArray()){var values=new ArrayList<String>();node.forEach(n->values.add(normalized(n)));return "["+String.join(",",values)+"]";}
        return node.isTextual()?"S"+node.toString():node.toString();
    }
    public boolean same(CanvasElementSnapshot a,CanvasElementSnapshot b){return normalized(semantic(a)).equals(normalized(semantic(b)));}
    private JsonNode semantic(CanvasElementSnapshot snapshot){
        if(snapshot==null)return json.nullNode();
        ObjectNode node=(ObjectNode)tree(snapshot);node.remove("version");node.remove("createdAt");node.remove("updatedAt");node.remove("deletedAt");
        node.put("deleted",snapshot.deletedAt()!=null);return node;
    }
    public int revision(String after){return read(after).path("revision").asInt(0);}
}
