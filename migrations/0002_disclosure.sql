-- 0002_disclosure.sql
-- 공개 페이지 하단 고지 문구(쿠팡파트너스 등). 관리자에서 직접 입력한다.
-- 비어 있으면 공개 페이지에 아무것도 안 나온다.

ALTER TABLE site_settings ADD COLUMN disclosure TEXT;
