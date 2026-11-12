-- Mutex rows have no account FK: quota locking must not invert existing account/diary/FK lock order.
create table inventory_quota_locks(user_id bigint primary key);
create table inventory_media_reservations(
 reservation_id uuid primary key,user_id bigint not null,kind varchar(20) not null,expires_at timestamptz not null
);
create index inventory_media_reservations_owner on inventory_media_reservations(user_id,kind,expires_at);
alter table media_files add column library_removed_at timestamptz;
alter table diaries add column inventory_shared boolean not null default false;
create index media_files_inventory on media_files(owner_user_id,library_category) where deleted_at is null and library_removed_at is null;
-- A shared book stays shared after its other members leave.
update diaries d set inventory_shared=true where visibility='MEMBERS' or (select count(*) from diary_members m where m.diary_id=d.diary_id and m.left_at is null)>1;
create index media_files_hidden_cleanup on media_files((coalesce(deleted_at,library_removed_at)),media_file_id) where deleted_at is not null or library_removed_at is not null;
