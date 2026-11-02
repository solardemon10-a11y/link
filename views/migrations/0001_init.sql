-- 조회수 대시보드 스키마. (PRAGMA 넣지 말 것 — 원격 D1 은 마이그레이션 안 PRAGMA 를 거부함)

CREATE TABLE accounts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  platform       TEXT NOT NULL CHECK (platform IN ('youtube','instagram','tiktok','facebook','threads','x','other')),
  label          TEXT NOT NULL,            -- 화면에 보이는 이름 (예: "쇼츠 계정 3")
  handle         TEXT,                     -- 표시용 @핸들 (선택)
  external_id    TEXT,                     -- youtube: 채널ID(UC...) 또는 @핸들 / instagram: IG 사용자 ID
  token          TEXT,                     -- instagram 액세스 토큰. API 응답에는 절대 내보내지 않음
  manual_total   INTEGER,                  -- 자동수집이 안 되는 플랫폼에서 직접 입력한 총 조회수
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_synced_at TEXT,
  last_error     TEXT
);

CREATE TABLE videos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  external_id  TEXT NOT NULL,              -- 플랫폼 영상 ID (수동 입력은 'm-' + 랜덤)
  title        TEXT NOT NULL DEFAULT '',
  url          TEXT,
  published_at TEXT,
  views        INTEGER NOT NULL DEFAULT 0,
  likes        INTEGER,
  comments     INTEGER,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (account_id, external_id)
);
CREATE INDEX idx_videos_account ON videos(account_id);
CREATE INDEX idx_videos_views ON videos(views DESC);

-- 계정별 하루 1행(그날의 마지막 총 조회수). 증감 계산용.
CREATE TABLE account_snapshots (
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,                -- YYYY-MM-DD (한국시간)
  views      INTEGER NOT NULL,
  PRIMARY KEY (account_id, day)
);
