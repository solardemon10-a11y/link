-- 0001_initial_schema.sql
-- 이 파일이 스키마의 유일한 출처(source of truth)다.
-- 예전 schema.sql / clicks.sql 는 삭제됨 — 다시 만들지 말 것.
--
-- 적용:
--   로컬:  npx wrangler d1 migrations apply multilink-db --local
--   원격:  npx wrangler d1 migrations apply multilink-db --remote
--
-- 제외한 것: contents / content_products / dm_rules / content_dm_rules
--   → 아직 코드에 구현이 없는 죽은 스키마였다. 실제로 만들 때 다음 마이그레이션으로 추가한다.
-- 제외한 것: products.is_pinned / product_links.is_pinned (고정/핀 기능)
--   → half-baked 라서 걷어냈다. 재도입 시 마이그레이션으로.

PRAGMA foreign_keys = ON;

-- ============================================================
-- 상품
-- ============================================================
CREATE TABLE products (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    product_number TEXT    NOT NULL UNIQUE,
    name           TEXT    NOT NULL,
    image_url      TEXT,
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_is_active  ON products(is_active);
CREATE INDEX idx_products_created_at ON products(created_at DESC);

-- ============================================================
-- 상품 링크 (쿠팡 / 네이버)
-- ============================================================
CREATE TABLE product_links (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    platform   TEXT    NOT NULL CHECK (platform IN ('coupang', 'naver')),
    url        TEXT    NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE (product_id, platform)
);

CREATE INDEX idx_product_links_product_id ON product_links(product_id);
CREATE INDEX idx_product_links_platform   ON product_links(platform);

-- ============================================================
-- 클릭 기록 (/go/:id/:platform 리다이렉트마다 1행)
-- ============================================================
CREATE TABLE link_clicks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    platform   TEXT    NOT NULL CHECK (platform IN ('coupang', 'naver')),
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 관리자 집계 쿼리가 product_id + platform 으로 묶으므로 복합 인덱스 하나로 커버
CREATE INDEX idx_link_clicks_product_platform ON link_clicks(product_id, platform);
CREATE INDEX idx_link_clicks_created_at       ON link_clicks(created_at DESC);

-- ============================================================
-- 사이트 방문 기록 (날짜별 카운트) — Admin 상단 총/오늘 표시용
-- ============================================================
CREATE TABLE site_visits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_date  TEXT    NOT NULL UNIQUE DEFAULT (date('now')),
    visit_count INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- 사이트 설정 (단일 행, id = 1)
-- ============================================================
CREATE TABLE site_settings (
    id                       INTEGER PRIMARY KEY CHECK (id = 1),
    site_name                TEXT    NOT NULL DEFAULT '멀티링크',
    greeting                 TEXT,
    representative_image_url  TEXT,
    link_columns             INTEGER NOT NULL DEFAULT 2 CHECK (link_columns IN (1, 2, 3, 6)),
    theme                    TEXT    NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
    created_at               TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO site_settings (id, site_name, greeting, representative_image_url, link_columns, theme)
VALUES (1, '멀티링크', '안녕하세요!', NULL, 2, 'light');
