-- 0003_visit_dedup.sql
-- 방문수 하루 1회 중복 제거용. 쿠키 대신 (날짜 + IP+UA 해시) 키를 쓴다.
-- 인앱 브라우저(인스타·카톡 등)는 쿠키를 안 물고 오거나 페이지를 두 번 로드해서
-- 쿠키 방식이 부풀려졌다. 이 테이블에 키가 이미 있으면 카운트하지 않는다.
--
-- 원문 IP 는 저장하지 않는다 (SHA-256 해시 앞부분만). 날짜가 키에 포함돼 매일 회전.

CREATE TABLE visit_keys (
    k          TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_visit_keys_created_at ON visit_keys(created_at);
