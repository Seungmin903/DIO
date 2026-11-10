package com.f106.DIO.media.repository;

/** PostgreSQL expressions intentionally match the V22 GIN indexes exactly. */
public final class MediaReferenceSql {
    private MediaReferenceSql() {}
    public static String jsonIds(String column) {
        return "cast(lower(cast(jsonb_path_query_array("+column+", '$.**.mediaFileId') as text)) as jsonb)";
    }
    public static final String UNREFERENCED = """
          and not exists (select 1 from diaries cover where cover.cover_json like concat('%"mediaFileId":"',cast(media_files.media_file_id as text),'"%'))
          and not exists (select 1 from canvas_elements element where element.media_file_id = media_files.media_file_id)
          and not exists (select 1 from canvas_elements element where cast(lower(cast(jsonb_path_query_array(element.properties_json, '$.**.mediaFileId') as text)) as jsonb) @> jsonb_build_array(cast(media_files.media_file_id as text)))
          and not exists (select 1 from canvas_history_operations history where cast(lower(cast(jsonb_path_query_array(history.before_state_json, '$.**.mediaFileId') as text)) as jsonb) @> jsonb_build_array(cast(media_files.media_file_id as text)) or cast(lower(cast(jsonb_path_query_array(history.after_state_json, '$.**.mediaFileId') as text)) as jsonb) @> jsonb_build_array(cast(media_files.media_file_id as text)))
          and not exists (select 1 from diary_handwriting_fonts font where font.font_media_file_id = media_files.media_file_id)
          and not exists (select 1 from diary_media_library library where library.media_file_id = media_files.media_file_id)
          and not exists (select 1 from user_sticker_library_media sticker_library where sticker_library.media_file_id = media_files.media_file_id)
          and not exists (select 1 from user_tape_library_media tape_library where tape_library.media_file_id = media_files.media_file_id)
          and not exists (select 1 from ai_jobs job where job.source_media_file_id = media_files.media_file_id or job.result_media_file_id = media_files.media_file_id)
          and not exists (select 1 from media_files derived where derived.source_media_file_id = media_files.media_file_id)
          and not exists (select 1 from diary_members profile_member where profile_member.member_profile_photo_id = media_files.media_file_id)
        """;
    // Only the existing H2 test profile lacks PostgreSQL JSONPath and GIN.
    public static final String H2_UNREFERENCED = """
          and not exists (select 1 from diaries cover where cover.cover_json like concat('%"mediaFileId":"',cast(media_files.media_file_id as varchar),'"%'))
          and not exists (select 1 from canvas_elements element where element.media_file_id = media_files.media_file_id or lower(cast(element.properties_json as varchar)) like concat('%',cast(media_files.media_file_id as varchar),'%'))
          and not exists (select 1 from canvas_history_operations history where lower(cast(history.before_state_json as varchar)) like concat('%',cast(media_files.media_file_id as varchar),'%') or lower(cast(history.after_state_json as varchar)) like concat('%',cast(media_files.media_file_id as varchar),'%'))
          and not exists (select 1 from diary_handwriting_fonts font where font.font_media_file_id = media_files.media_file_id)
          and not exists (select 1 from diary_media_library library where library.media_file_id = media_files.media_file_id)
          and not exists (select 1 from user_sticker_library_media sticker_library where sticker_library.media_file_id = media_files.media_file_id)
          and not exists (select 1 from user_tape_library_media tape_library where tape_library.media_file_id = media_files.media_file_id)
          and not exists (select 1 from ai_jobs job where job.source_media_file_id = media_files.media_file_id or job.result_media_file_id = media_files.media_file_id)
          and not exists (select 1 from media_files derived where derived.source_media_file_id = media_files.media_file_id)
          and not exists (select 1 from diary_members profile_member where profile_member.member_profile_photo_id = media_files.media_file_id)
        """;
}
