import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

// 스키마가 필요 없는 스모크 테스트.
// (홈/상품 등 D1 스키마가 필요한 테스트는 마이그레이션 적용 셋업을 붙인 뒤 추가)

// 인증 미구성 상태를 강제한다. (로컬 .dev.vars 의 ALLOW_INSECURE_ADMIN 을 무시)
const lockedEnv = {
  ...env,
  ALLOW_INSECURE_ADMIN: "",
  ADMIN_PASSWORD: "",
};

async function fetchWith(path: string, init?: RequestInit, e: unknown = env) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("https://example.com" + path, init), e as never, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("라우팅 / 인증 가드", () => {
  it("알 수 없는 경로는 404", async () => {
    expect((await fetchWith("/nope")).status).toBe(404);
  });

  it("잘못된 /go 경로는 404 (라우터에서 매칭 실패)", async () => {
    expect((await fetchWith("/go/abc/coupang")).status).toBe(404);
  });

  it("/admin 은 인증 미설정 시 500 으로 잠긴다 (fail-closed)", async () => {
    const res = await fetchWith("/admin", undefined, lockedEnv);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("관리자 인증");
  });

  it("/api/* 도 인증 미설정 시 잠긴다", async () => {
    const res = await fetchWith(
      "/api/products",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      lockedEnv,
    );
    expect(res.status).toBe(500);
  });
});
