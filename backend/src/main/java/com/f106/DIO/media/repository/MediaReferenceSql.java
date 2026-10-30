package com.f106.DIO.media.repository;

/** media_files의 FK 및 캔버스 JSON/복원 이력 참조. 탈퇴와 물리 삭제가 같은 보호 조건을 사용한다. */
public final class MediaReferenceSql {
    private MediaReferenceSql() {}
    public static final String UNREFERENCED = """
          and not exists (select 1 from canvas_elements element where element.media_file_id = media_files.media_file_id or lower(cast(element.properties_json as varchar)) like concat('%',cast(media_files.media_file_id as varchar),'%'))
          and not exists (select 1 from canvas_history_operations history where lower(cast(history.before_state_json as varchar)) like concat('%',cast(media_files.media_file_id as varchar),'%') or lower(cast(history.after_state_json as varchar)) like concat('%',cast(media_files.media_file_id as varchar),'%'))
          and not exists (select 1 from diary_handwriting_fonts font where font.font_media_file_id = media_files.media_file_id)
          and not exists (select 1 from diary_media_library library where library.media_file_id = media_files.media_file_id)
          and not exists (select 1 from ai_jobs job where job.source_media_file_id = media_files.media_file_id or job.result_media_file_id = media_files.media_file_id)
          and not exists (select 1 from media_files derived where derived.source_media_file_id = media_files.media_file_id)
          and not exists (select 1 from diary_members profile_member where profile_member.member_profile_photo_id = media_files.media_file_id)
        """;
}
