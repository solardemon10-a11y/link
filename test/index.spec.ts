import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

// 스키마가 필요 없는 스모크 테스트.
// (홈/상품 등 D1 스키마가 필요한 테스트는 마이그레이션 적용 셋업을 붙인 뒤 추가)

describe("라우팅 / 인증 가드", () => {
  it("알 수 없는 경로는 404", async () => {
    const res = await SELF.fetch("https://example.com/nope");
    expect(res.status).toBe(404);
  });

  it("잘못된 /go 경로는 404 (D1 접근 전에 차단)", async () => {
    const res = await SELF.fetch("https://example.com/go/abc/coupang");
    expect(res.status).toBe(404);
  });

  it("/admin 은 Access 미구성 시 500 으로 잠긴다 (fail-closed)", async () => {
    const res = await SELF.fetch("https://example.com/admin");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("관리자 인증");
  });

  it("/api/* 도 동일하게 잠긴다", async () => {
    const res = await SELF.fetch("https://example.com/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(500);
  });
});
