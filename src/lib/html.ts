// HTML output helpers. Shared by home.ts / admin.ts.
// (한글 주석은 보안상 중요하지 않아 영문으로 최소화)

/** HTML 텍스트/속성값 이스케이프 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// <script> 블록 안에 JSON 을 그대로 넣을 때 사용한다.
// 상품명에 </script> 가 있으면 스크립트가 깨지고 XSS 로 이어질 수 있어
// '<' 를 치환해 </script> 브레이크아웃과 <!-- 주입을 모두 막는다.
export function jsonForScript(data: unknown): string {
  return JSON.stringify(data).split("<").join("\\u003c");
}
