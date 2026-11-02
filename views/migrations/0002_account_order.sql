-- 계정 목록 순서(드래그로 변경). 기존 계정은 등록 순서(id)를 초기값으로 한다.
-- (PRAGMA 넣지 말 것 — 원격 D1 은 마이그레이션 안 PRAGMA 를 거부함)
ALTER TABLE accounts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE accounts SET sort_order = id;
