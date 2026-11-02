-- 자동 수집이 "가장 오래 시도하지 않은 계정부터" 처리하도록 마지막 시도 시각을 기록한다.
-- (오류로 계속 실패하는 계정이 매번 맨 앞에서 한도를 차지하지 않게 하기 위함)
ALTER TABLE accounts ADD COLUMN last_attempt_at TEXT;
