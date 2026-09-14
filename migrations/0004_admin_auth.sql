-- 0004_admin_auth.sql
-- 관리자가 직접 비밀번호를 바꿀 수 있게 하려고 비밀번호(해시)를 D1에
-- 저장한다. 지금까지는 ADMIN_PASSWORD 시크릿(코드 배포로만 바꿀 수
-- 있음) 하나뿐이었다 - 이 컬럼이 비어 있으면 그 시크릿 값으로
-- 로그인하다가, 관리자 화면에서 "비밀번호 변경"을 한 번이라도 하면
-- 그 뒤로는 이 해시만 쓴다(auth.ts 참고).

ALTER TABLE site_settings ADD COLUMN admin_password_hash TEXT;
