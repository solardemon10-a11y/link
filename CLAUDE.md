# CLAUDE.md

> Claude Code 작업용 요약. `AGENTS.md`는 Cloudflare 일반 지침(별도).
> 마지막 갱신: 2026-09-14

---

## 1. 무엇인가

**번호 중심 멀티링크 (link-in-bio).** 쇼핑 쇼츠 캡션의 "3번 상품" → 프로필 링크 →
번호로 검색 → 쿠팡/네이버 링크. Cloudflare Workers + D1(SQLite) + TS, 빌드 없음.

- **라이브**: `https://link.onelookshopping.workers.dev` (워커 이름 `link`, 계정 서브도메인 `onelookshopping`)
- **원격 D1**: `multilink-db`, id `1948bd65-eb8d-45ff-9d81-9c74f7ee9222`
- **공개 `/`** 는 무인증, **`/admin`·`/api/*`** 는 Basic Auth (비밀번호 1개)

## 2. 파일 지도

```
src/index.ts        엔트리 · 라우터(정규식 테이블) · 모든 핸들러 · D1 쿼리
src/auth.ts         관리자 Basic Auth (Authorization: Basic, 비밀번호만 확인)
src/env.ts          Env 타입 (multilink_db, ADMIN_PASSWORD, ALLOW_INSECURE_ADMIN)
src/types.ts        공유 도메인 타입 (Product, AdminProduct, SiteSettings, ...)
src/lib/html.ts     escapeHtml · jsonForScript(<script> 안 JSON 주입 시 '<' 이스케이프)
src/pages/home.ts   공개 페이지 (에디토리얼 레이아웃, HTML 문자열)
src/pages/admin.ts  관리자 페이지 (상품 CRUD · 설정 · 미리보기 iframe)
migrations/          0001 스키마 · 0002 disclosure 컬럼 · 0003 visit_keys
test/index.spec.ts  스모크 테스트 (라우팅 · 인증 fail-closed) — D1 스키마 불필요
```

**DB 테이블**: `products` · `product_links`(coupang/naver, UNIQUE(product_id,platform))
· `link_clicks`(클릭 1행씩) · `site_visits`(날짜별 카운트) · `site_settings`(단일 행 id=1)
· `visit_keys`(방문 중복제거 키).

## 3. 실행 흐름

```
fetch(request, env, ctx)
  ↓ /admin·/api/* → requireAdmin (통과 못하면 401/500)
  ↓ / GET → handleHomePage(db, preview) → 방문 카운트(조건부, waitUntil)
  ↓ ROUTES 정규식 테이블 순회 (구체적 패턴 먼저, 첫 매치 승)
  ↓ 없으면 404
```

- 상품 목록 = `products` LEFT JOIN `product_links` 피벗(MAX CASE) → 한 행에 coupang/naver.
- 검색은 **클라이언트 JS 필터** (번호+이름). 서버측 `?search=` 없음.
- `/go/:id/:platform` → 활성 링크 조회 → `link_clicks` INSERT(waitUntil, 봇 제외) → 302.

## 4. 확정된 결정 (다시 묻지 말 것)

- **번호(`product_number`)는 한번 부여되면 고정.** 관리자 페이지에선 직접
  입력, Youtube 자동화 쪽은 `next-number` API로 순번 자동 부여(§7) — 어느
  경로든 부여 후 재부여/시프트 금지. 캡션의 숫자 = 상품 번호가 어긋나면 안 됨.
- **관리자 인증 = Basic Auth** (`wrangler secret put ADMIN_PASSWORD`). 아이디는 무시,
  비밀번호만 확인. 미설정 시 500 fail-closed. Cloudflare Access 는 폐기(전환됨).
  로컬은 `.dev.vars` 의 `ALLOW_INSECURE_ADMIN="true"`.
- **디자인**: 에디토리얼 (원형 모노그램 + Noto Sans KR + 코코아·아이보리).
  항목 = 카드 아님, **2px 구분선**. 사진 매트 1px 테두리. 알약 버튼(쿠팡 채움 /
  네이버 테두리). 색 토큰은 `home.ts` 상단 `:root` 하드코딩 (관리자 색 조정 기능은 범위 밖).
- **고지 문구**: `site_settings.disclosure`, 관리자 입력. 공개 페이지 **하단 고정**(fixed).
- **이미지**: URL 입력만. 파일 업로드(R2)는 미구현 — 넣지 말 것(blob: URL 저장 사고 있었음).
- **방문수** = 하루 1회/기기 (`visit_keys` = `날짜:sha256(IP+UA)앞24자`, `INSERT OR IGNORE`).
  쿠키 방식은 인앱 브라우저에 약해서 폐기. `Sec-Fetch-Mode=navigate` 인 실제 이동만 카운트.
  인스타·페북·텔레그램은 UA가 달라 각각 1로 잡힘(유입 채널로 간주, 통일 불가).
- **클릭수** = 누를 때마다 누적. 하루 제한 없음. 봇만 제외. 상품 삭제 시 FK cascade 로 같이 삭제.
- **캐시**: 공개 `/` 는 `public, max-age=30` (편집 후 최대 30초 stale). `?preview=1` 은
  `no-store` (관리자 미리보기 즉시 갱신). `/go` 리다이렉트는 `private, no-store`.
- 죽은 스키마(`contents`/`dm_rules` 등)·핀 기능은 0001 에서 제외됨. 재도입 시 마이그레이션.

## 5. 함정 (되돌리지 말 것)

- **마이그레이션에 `PRAGMA` 넣지 말 것.** 로컬 miniflare 는 통과하지만 원격 D1 은
  마이그레이션 안 PRAGMA 를 API 에러로 뱉는다 (0001 에서 제거함). D1 은 FK 기본 ON.
- **`wrangler d1 list` 의 `num_tables` 는 캐시라 틀릴 수 있다.** 실제 확인은
  `SELECT name FROM sqlite_master WHERE type='table'`.
- **secret 은 워커별.** 워커 이름 바꿔 재배포하면 새 워커라 `ADMIN_PASSWORD` 다시 등록해야 함.
- **`wrangler tail` 의 "Ok" = 예외 없이 응답함. 401/500 도 "Ok" 로 찍힘** (통과 아님).
- **admin 미리보기 iframe** 은 `/?preview=1` 로 로드 — 방문 카운트 제외 대상.
  admin 페이지 열 때마다 `/admin` + `/?preview=1` 쌍이 로그에 뜨는 건 정상.
- 상품/설정 변경 핸들러는 `location.reload()` 로 admin 을 새로고침 → iframe 도 갱신.
  `?preview=1` 이 `no-store` 라서 즉시 반영됨.
- `<script>` 에 `JSON.stringify(products)` 직접 넣지 말 것 — `jsonForScript()` 사용
  (상품명의 `</script>` 브레이크아웃 방지).

## 6. 명령

| | |
|---|---|
| 로컬 | `npm run dev` (`.dev.vars` 에 `ALLOW_INSECURE_ADMIN="true"`) |
| 로컬 마이그레이션 | `npm run migrate:local` |
| 원격 마이그레이션 | `npm run migrate:remote` (배포와 별개, 스키마 바꾸면 필수) |
| 배포 | `npx wrangler deploy` |
| 관리자 비번 설정 | `npx wrangler secret put ADMIN_PASSWORD` |
| 실시간 요청 로그 | `npx wrangler tail link` |
| 원격 쿼리 | `npx wrangler d1 execute multilink-db --remote --command "..."` |
| 테스트/타입체크 | `npx vitest run` / `npx tsc --noEmit` |

- **로컬 D1(`.wrangler/state`)에 DELETE·시딩 스크립트 돌리지 말 것.** 사용자 데이터가
  거기 있을 수 있음(실제로 날린 사고 있었음). 검증은 읽기 전용으로, 아니면 확인받고.
- 테스트로 `wrangler dev` 띄웠으면 **그 포트의 PID만** 정확히 종료. 이름 패턴
  (`wrangler.*dev`)으로 일괄 kill 하면 사용자가 켜둔 서버까지 죽는다(사고 있었음).

## 7. 미해결 / 다음

- ~~쇼츠 프로그램 연동 미구현~~ → **완료, 실사용 중 (2026-09-14 기준).**
  `D:\Automation\Youtube`의 `multilink_client.py`가 이 API를 호출한다:
  - `GET /api/products/next-number` (`handleNextNumber`, `index.ts:402`) — 다음
    번호 미리보기(`MAX(CAST(product_number AS INTEGER))+1`, 자릿수는 기존 최대
    번호 폭 유지).
  - `POST /api/products` — 실제 등록(번호 확정, `is_active=1`로 생성됨 →
    Youtube 쪽이 등록 직후 곧바로 아래 PUT으로 비활성화해 "번호만 예약, 노출은
    업로드 성공 후"를 구현).
  - `PUT /api/products/:id/status` (`handleProductStatus`) — 업로드 성공 시
    활성화. 실패 시 비활성 상태로 방치(공개 페이지에 안 뜸).
  - `PUT /api/products/:id`(update) — 등록 후 네이버 링크가 나중에 들어오면 추가.
  경쟁 조건 방지 로직(번호 확정을 최대한 이른 시점에 실제 등록으로 옮김)은
  Youtube 프로젝트 쪽 책임 — 여기 API는 그대로, 호출 시점만 그쪽에서 관리.
- `visit_keys` 정리(오래된 행 삭제) 안 함 — 작아서 방치. 커지면 cron 또는 주기 삭제.
- 관리자 페이지 디자인은 아직 공개 페이지 톤으로 안 맞춤(구 스타일).
- 짧은 도메인 미적용 (workers.dev 주소 사용 중). Cloudflare Registrar + Custom Domain.
- 다크모드 색은 조정 대상 밖(고정). 관리자 색 조정 기능은 미구현(`appearance` JSON 컬럼 방식으로 확장 가능).
