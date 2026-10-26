-- H2 계약 테스트 전용. 실제 V1 DDL 검증은 postgresNotificationTest에서 별도로 수행한다.
create table users(user_id bigint primary key, nickname varchar(30) not null);
create table notifications(
    notification_id bigint primary key,
    user_id bigint not null,
    actor_user_id bigint,
    diary_id uuid,
    page_id uuid,
    notification_type varchar(50) not null,
    read_at timestamp(6) with time zone,
    deleted_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone not null
);
