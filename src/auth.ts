// 관리자 인증 — Cloudflare Access 발급 JWT 검증.
//
// 배포 환경: Cloudflare 대시보드 Zero Trust > Access 에서 이 Worker 도메인의
//   /admin 과 /api/* 를 보호하는 Application 을 만든 뒤, 아래 두 값을 설정한다.
//     wrangler secret put CF_ACCESS_AUD          (Application Audience 태그)
//     [vars] CF_ACCESS_TEAM_DOMAIN = "yourteam.cloudflareaccess.com"
//
// 로컬 개발: .dev.vars 에 ALLOW_INSECURE_ADMIN="true" 를 넣으면 검증을 건너뛴다.
//   (.dev.vars 는 .gitignore 처리돼 있고 배포에는 안 올라간다)
//
// 둘 다 없으면 관리자 경로는 500 으로 잠긴다(fail-closed). "설정을 깜빡하고 배포"
// 했을 때 무인증으로 열리는 것을 막기 위해서다.

import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "./env";

type Guard = { ok: true } | { ok: false; response: Response };

// createRemoteJWKSet 인스턴스는 내부적으로 공개키를 캐시한다 → 재사용해야 매 요청 fetch 안 함.
const jwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(certsUrl: string) {
  let set = jwksByUrl.get(certsUrl);
  if (!set) {
    set = createRemoteJWKSet(new URL(certsUrl));
    jwksByUrl.set(certsUrl, set);
  }
  return set;
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("Cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/**
 * /admin, /api/* 요청 앞단에서 호출한다.
 * 통과하면 { ok: true }, 막히면 { ok: false, response } 를 돌려준다.
 */
export async function requireAdmin(request: Request, env: Env): Promise<Guard> {
  if (env.ALLOW_INSECURE_ADMIN === "true") {
    return { ok: true };
  }

  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const aud = env.CF_ACCESS_AUD?.trim();

  if (!teamDomain || !aud) {
    return {
      ok: false,
      response: jsonError(
        "관리자 인증이 구성되지 않았습니다. CF_ACCESS_TEAM_DOMAIN 과 CF_ACCESS_AUD 를 설정하거나, 로컬이면 .dev.vars 에 ALLOW_INSECURE_ADMIN=\"true\" 를 넣으세요.",
        500,
      ),
    };
  }

  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ?? readCookie(request, "CF_Authorization");

  if (!token) {
    return { ok: false, response: jsonError("로그인이 필요합니다.", 401) };
  }

  try {
    await jwtVerify(token, getJwks(`https://${teamDomain}/cdn-cgi/access/certs`), {
      issuer: `https://${teamDomain}`,
      audience: aud,
    });
    return { ok: true };
  } catch {
    return { ok: false, response: jsonError("인증에 실패했습니다. 다시 로그인해 주세요.", 403) };
  }
}
