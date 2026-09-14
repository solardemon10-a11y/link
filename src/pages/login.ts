// login.ts - 관리자 로그인 화면. 브라우저 기본 Basic Auth 팝업 대신
// 이 화면을 쓰는 이유는 auth.ts 상단 설명 참고.

export function loginPage(opts: { error?: boolean } = {}): string {
  const errorHtml = opts.error
    ? `<p class="error">비밀번호가 올바르지 않습니다.</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>관리자 로그인</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    display: flex; align-items: center; justify-content: center;
    background: #f5f5f5; color: #222;
    font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  }
  .box {
    width: 100%; max-width: 320px; padding: 32px 28px;
    background: #ffffff; border: 1px solid #e8e8e8; border-radius: 16px;
    box-shadow: 0 8px 24px rgba(0,0,0,.06);
  }
  h1 { margin: 0 0 20px; font-size: 18px; text-align: center; }
  input {
    width: 100%; height: 44px; padding: 0 12px; margin-bottom: 12px;
    border: 1px solid #e0e0e0; border-radius: 9px; font-size: 15px;
  }
  button {
    width: 100%; height: 46px; border: 0; border-radius: 9px;
    background: #222; color: #fff; font-weight: 700; cursor: pointer; font-size: 15px;
  }
  .error { margin: 0 0 12px; color: #d93636; font-size: 13px; text-align: center; }
</style>
</head>
<body>
  <form class="box" method="POST" action="/admin/login">
    <h1>관리자 로그인</h1>
    ${errorHtml}
    <input type="password" name="password" placeholder="비밀번호" autofocus required>
    <button type="submit">로그인</button>
  </form>
</body>
</html>`;
}
