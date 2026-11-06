package com.f106.DIO.diary.creation;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.core.JacksonException;
import tools.jackson.core.json.JsonFactory;
import tools.jackson.core.StreamReadConstraints;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** 231 초기 페이지 전용. 호출자의 트랜잭션·DB를 사용하고 카탈로그를 임의로 생성하지 않는다. */
public class JdbcDiaryInitialPages implements DiaryInitialPages {
    private static final int MAX_CONFIG_LENGTH = 16384;
    private static final List<String> CONFIG_KEYS = List.of("width", "height", "paperAppearance", "blank", "remoteTemplate");
    /** 원격 속지(V34). 그림은 앱이 에셋 저장소의 catalog.json 에서 remoteTemplate id 로 찾는다. 서버는 id 형식만 검사한다. */
    static final String REMOTE_TEMPLATE_PREFIX = "dio-remote-";
    private static final String REMOTE_TEMPLATE_ID = "[a-z0-9][a-z0-9-]{0,39}";
    private static final List<String> COLOR_KEYS = List.of("backgroundColor", "layoutColor");
    private final JdbcTemplate jdbc;
    private final String catalogLock;
    private final String jsonParameter;
    private final JsonMapper json = JsonMapper.builder(JsonFactory.builder()
        .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
        .streamReadConstraints(StreamReadConstraints.builder().maxNestingDepth(16).maxStringLength(MAX_CONFIG_LENGTH).build())
        .build()).enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();

    public JdbcDiaryInitialPages(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        boolean postgres = Boolean.TRUE.equals(jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Boolean>)
            c -> "PostgreSQL".equals(c.getMetaData().getDatabaseProductName())));
        catalogLock = postgres ? " for share" : " for update";
        jsonParameter = postgres ? "cast(? as jsonb)" : "? format json";
    }

    @Override public void validateSelections(List<Selection> selections) { prepare(selections); }

    @Override public List<UUID> create(UUID diaryId, long ownerUserId, List<Selection> selections, Instant createdAt) {
        var plans = prepare(selections);
        var owners = jdbc.queryForList("select owner_user_id from diaries where diary_id=? and deleted_at is null for update",Long.class,diaryId);
        Long memberships = jdbc.queryForObject("select count(*) from diary_members where diary_id=? and user_id=? and role='OWNER' and left_at is null",Long.class,diaryId,ownerUserId);
        Long count = jdbc.queryForObject("select count(*) from pages where diary_id=?",Long.class,diaryId);
        if (createdAt == null || ownerUserId <= 0 || owners.size()!=1 || owners.get(0)!=ownerUserId || memberships!=1 || count!=0) {
            throw DiaryCreationException.invalidState();
        }
        var ids = new ArrayList<UUID>();
        for (int index=0; index<plans.size(); index++) {
            var plan = plans.get(index);
            UUID id = UUID.randomUUID();
            int inserted = jdbc.update("insert into pages(page_id,diary_id,template_id,template_config,sort_key,canvas_width,canvas_height,created_at,updated_at)"
                + " values (?,?,?,"+jsonParameter+",?,?,?,?,?)",id,diaryId,plan.template.id,plan.config,index+1,
                plan.template.width,plan.template.height,Timestamp.from(createdAt),Timestamp.from(createdAt));
            if (inserted != 1) throw DiaryCreationException.invalidState();
            ids.add(id);
        }
        return List.copyOf(ids);
    }

    private List<Plan> prepare(List<Selection> selections) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("Initial pages require the caller transaction");
        if (selections == null || selections.isEmpty() || selections.size()>4096 || selections.stream().anyMatch(java.util.Objects::isNull)) {
            throw new InvalidSelection("Initial pages are required");
        }
        var keys = selections.stream().map(s -> new Key(s.templateCode(),s.templateVersion())).distinct()
            .sorted(Comparator.comparing(Key::code,Comparator.nullsFirst(Comparator.naturalOrder()))
                .thenComparing(Key::version,Comparator.nullsFirst(Comparator.naturalOrder()))).toList();
        Map<Key,Template> templates = new HashMap<>();
        // 잠금 순서를 고정하고, 실제 페이지 생성은 요청 순서를 유지한다.
        for (var key : keys) {
            if (key.code==null || key.code.isBlank() || key.code.length()>100 || key.version==null || key.version.isBlank() || key.version.length()>30) {
                throw new InvalidSelection("Invalid template selection");
            }
            var rows = jdbc.query("select template_id,canvas_width,canvas_height,orientation,default_config,is_active from page_templates"
                + " where code=? and template_version=? order by template_id"+catalogLock,
                (rs,row) -> new Template(rs.getLong("template_id"),rs.getBigDecimal("canvas_width"),rs.getBigDecimal("canvas_height"),
                    rs.getString("orientation"),rs.getString("default_config"),rs.getBoolean("is_active"),key.code.startsWith(REMOTE_TEMPLATE_PREFIX)),key.code,key.version);
            // 코드·버전은 공개 식별자다. 비활성 중복도 숨기지 않고 모호한 매핑은 거부한다.
            if (rows.size()!=1 || !rows.get(0).active) throw new InvalidSelection("Unknown, inactive or ambiguous template");
            var template = rows.get(0);
            if (template.width==null || template.height==null || template.width.signum()<=0 || template.height.signum()<=0
                    || !("LANDSCAPE".equals(template.orientation) || "PORTRAIT".equals(template.orientation))) throw DiaryCreationException.invalidState();
            templates.put(key,template);
        }
        var plans = new ArrayList<Plan>();
        for (var selection : selections) {
            var template = templates.get(new Key(selection.templateCode(),selection.templateVersion()));
            JsonNode defaults;
            try { defaults = configuration(template.defaults,template); }
            catch (InvalidSelection invalidCatalog) { throw DiaryCreationException.invalidState(); }
            JsonNode requested = configuration(selection.configurationJson(),template);
            ObjectNode merged = json.createObjectNode();
            merged.put("width",template.width); merged.put("height",template.height);
            var appearance = json.createObjectNode();
            for (var source : List.of(defaults,requested)) {
                if (source.has("blank")) merged.set("blank",source.get("blank"));
                if (source.has("remoteTemplate")) merged.put("remoteTemplate",source.get("remoteTemplate").asString());
                if (source.has("paperAppearance")) {
                    for (var color : COLOR_KEYS) {
                        if (source.get("paperAppearance").has(color)) appearance.put(color,source.get("paperAppearance").get(color).asString().toUpperCase(Locale.ROOT));
                    }
                }
            }
            if (!appearance.isEmpty()) merged.set("paperAppearance",appearance);
            // 원격 속지 페이지는 어떤 그림인지(remoteTemplate)가 있어야 한다
            if (template.remote && !merged.has("remoteTemplate")) throw new InvalidSelection("Remote template id is required");
            plans.add(new Plan(template,json.writeValueAsString(merged)));
        }
        return plans;
    }

    private JsonNode configuration(String encoded, Template template) {
        if (encoded == null) encoded = "{}";
        if (encoded.length()>MAX_CONFIG_LENGTH) throw new InvalidSelection("Configuration too large");
        JsonNode value;
        try { value = json.readTree(encoded); }
        catch (JacksonException malformed) { throw new InvalidSelection("Invalid configuration JSON"); }
        if (value==null || !value.isObject() || CONFIG_KEYS.stream().filter(value::has).count()!=value.size()) throw new InvalidSelection("Unsupported configuration");
        for (var dimension : List.of("width","height")) {
            if (value.has(dimension) && (!value.get(dimension).isNumber()
                    || value.get(dimension).decimalValue().compareTo(dimension.equals("width") ? template.width : template.height)!=0)) {
                throw new InvalidSelection("Page dimensions must match the catalog");
            }
        }
        if (value.has("blank") && !value.get("blank").isBoolean()) throw new InvalidSelection("Invalid blank flag");
        if (value.has("remoteTemplate") && (!template.remote || !value.get("remoteTemplate").isString()
                || !value.get("remoteTemplate").asString().matches(REMOTE_TEMPLATE_ID))) {
            throw new InvalidSelection("Invalid remote template");
        }
        if (value.has("paperAppearance")) {
            var appearance = value.get("paperAppearance");
            if (!appearance.isObject() || COLOR_KEYS.stream().filter(appearance::has).count()!=appearance.size()) throw new InvalidSelection("Invalid appearance");
            for (var color : COLOR_KEYS) {
                if (appearance.has(color) && (!appearance.get(color).isString() || !appearance.get(color).asString().matches("#[0-9a-fA-F]{6}"))) {
                    throw new InvalidSelection("Invalid appearance color");
                }
            }
        }
        return value;
    }
    private record Key(String code,String version) {}
    private record Template(long id,BigDecimal width,BigDecimal height,String orientation,String defaults,boolean active,boolean remote) {}
    private record Plan(Template template,String config) {}
}
