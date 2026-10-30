-- 닉네임은 표시 이름이며 중복을 허용한다. 기존 데이터·파생 키 컬럼은 보존한다.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_nickname_key_unique;
