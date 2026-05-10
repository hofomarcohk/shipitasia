const FOOTER_HTML = `
<hr style="margin-top:32px;border:none;border-top:1px solid #eee">
<p style="color:#888;font-size:12px;line-height:1.5">
  此為系統發信，請勿回覆。<br>
  如有疑問請聯絡客服 (TODO: CS 聯絡方式).
</p>
`;

const FOOTER_TEXT = `
此為系統發信，請勿回覆。
如有疑問請聯絡客服 (TODO: CS 聯絡方式).
`;

export function buildVerifyEmail(opts: { display_name: string; verify_url: string }) {
  const subject = "ShipItAsia — 請完成電郵驗證";
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="color:#1a1a1a">您好 ${escape(opts.display_name)}，</h2>
  <p>感謝您註冊 ShipItAsia 集運服務。請點擊以下按鈕完成電郵驗證：</p>
  <p style="margin:32px 0">
    <a href="${escape(opts.verify_url)}"
       style="background:#0066cc;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
      完成電郵驗證
    </a>
  </p>
  <p style="color:#666;font-size:14px">
    或複製以下連結貼到瀏覽器：<br>
    <code style="word-break:break-all">${escape(opts.verify_url)}</code>
  </p>
  <p style="color:#666;font-size:14px">
    此連結將於 24 小時後失效。如果您沒有註冊帳號，請忽略此信。
  </p>
  ${FOOTER_HTML}
</div>
`;
  const text = `您好 ${opts.display_name}，

感謝您註冊 ShipItAsia 集運服務。請點擊以下連結完成電郵驗證：

${opts.verify_url}

此連結將於 24 小時後失效。如果您沒有註冊帳號，請忽略此信。
${FOOTER_TEXT}`;
  return { subject, html, text };
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
