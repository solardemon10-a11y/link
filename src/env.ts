// 공유 Env 타입.
// worker-configuration.d.ts 의 생성된 Env 는 비어 있어서(재생성하려면 wrangler types 필요)
// 여기서 직접 선언해 index.ts 등에서 import 해 쓴다.

export interface Env {
  multilink_db: D1Database;

  // ── Cloudflare Access (관리자 인증) ──────────────────────────
  // 배포 환경에서 설정한다. 대시보드 Zero Trust > Access > Applications 에서 확인.
  //   CF_ACCESS_TEAM_DOMAIN: 예) "yourteam.cloudflareaccess.com"
  //   CF_ACCESS_AUD:         Application Audience(AUD) 태그
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;

  // 로컬 개발 전용 탈출구. .dev.vars 에 ALLOW_INSECURE_ADMIN="true" 로 두면
  // Access 검증을 건너뛴다. 배포 환경에는 절대 설정하지 말 것.
  ALLOW_INSECURE_ADMIN?: string;
}
