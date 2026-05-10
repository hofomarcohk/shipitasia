const FOOTER_HTML = `
<hr style="margin-top:32px;border:none;border-top:1px solid #eee">
<p style="color:#888;font-size:12px;line-height:1.5">
  此為系統發信，請勿回覆。<br>
  如非本人操作請忽略此信，您的帳號不受影響。<br>
  如有疑問請聯絡客服 (TODO: CS 聯絡方式).
</p>
`;

const FOOTER_TEXT = `
此為系統發信，請勿回覆。
如非本人操作請忽略此信，您的帳號不受影響。
如有疑問請聯絡客服 (TODO: CS 聯絡方式).
`;

export function buildResetPasswordEmail(opts: { display_name: string; reset_url: string }) {
  const subject = "ShipItAsia — 重設密碼";
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="color:#1a1a1a">您好 ${escape(opts.display_name)}，</h2>
  <p>我們收到了您的密碼重設請求。請點擊以下按鈕設定新密碼：</p>
  <p style="margin:32px 0">
    <a href="${escape(opts.reset_url)}"
       style="background:#0066cc;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
      重設密碼
    </a>
  </p>
  <p style="color:#666;font-size:14px">
    或複製以下連結貼到瀏覽器：<br>
    <code style="word-break:break-all">${escape(opts.reset_url)}</code>
  </p>
  <p style="color:#666;font-size:14px">
    此連結將於 1 小時後失效。
  </p>
  ${FOOTER_HTML}
</div>
`;
  const text = `您好 ${opts.display_name}，

我們收到了您的密碼重設請求。請點擊以下連結設定新密碼：

${opts.reset_url}

此連結將於 1 小時後失效。
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
