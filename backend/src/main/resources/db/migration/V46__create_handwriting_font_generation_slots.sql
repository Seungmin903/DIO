CREATE TABLE handwriting_font_generation_slots (
    user_id BIGINT PRIMARY KEY REFERENCES users (user_id) ON DELETE CASCADE,
    generation_id UUID NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE
);
