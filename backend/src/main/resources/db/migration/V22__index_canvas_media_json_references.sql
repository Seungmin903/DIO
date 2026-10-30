-- Index only mediaFileId values (including strip cells and undo snapshots), not entire JSON text.
-- Expressions match MediaReferenceSql.jsonIds; existing tables/columns and FK indexes remain intact.
CREATE INDEX IF NOT EXISTS idx_canvas_elements_json_media_refs
    ON canvas_elements USING gin ((cast(lower(cast(jsonb_path_query_array(properties_json, '$.**.mediaFileId') as text)) as jsonb)) jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_canvas_history_before_media_refs
    ON canvas_history_operations USING gin ((cast(lower(cast(jsonb_path_query_array(before_state_json, '$.**.mediaFileId') as text)) as jsonb)) jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_canvas_history_after_media_refs
    ON canvas_history_operations USING gin ((cast(lower(cast(jsonb_path_query_array(after_state_json, '$.**.mediaFileId') as text)) as jsonb)) jsonb_path_ops);
