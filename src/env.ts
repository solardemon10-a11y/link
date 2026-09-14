// 공유 Env 타입.
// worker-configuration.d.ts 의 생성된 Env 는 비어 있어서(재생성하려면 wrangler types 필요)
// 여기서 직접 선언해 index.ts 등에서 import 해 쓴다.

export interface Env {
  multilink_db: D1Database;

  // ── 관리자 인증 (로그인 폼 + 세션 쿠키) ──────────────────────
  // ADMIN_PASSWORD: 최초 부팅용 비밀번호(시크릿). site_settings.
  //   admin_password_hash가 아직 비어 있을 때만 이 값과 비교한다.
  //   관리자가 "비밀번호 변경"을 한 번이라도 하면 그 뒤로는 DB의
  //   해시만 쓰고 이 시크릿은 더 이상 안 쓴다.
  //   배포:  npx wrangler secret put ADMIN_PASSWORD
  ADMIN_PASSWORD?: string;

  // SESSION_SECRET: 로그인 세션 쿠키에 서명하는 키. 한 번 정하면 안
  //   바꾼다(바꾸면 로그인해 있던 사람 전부 로그아웃됨). 세션이 뭔지
  //   추측 못 하게 하는 용도라 충분히 긴 무작위 문자열이어야 한다.
  //   배포:  npx wrangler secret put SESSION_SECRET
  SESSION_SECRET?: string;

  // 로컬 개발 전용 탈출구. .dev.vars 에 ALLOW_INSECURE_ADMIN="true" 로 두면
  // 인증을 건너뛴다. 배포 환경에는 절대 설정하지 말 것.
  ALLOW_INSECURE_ADMIN?: string;
}
