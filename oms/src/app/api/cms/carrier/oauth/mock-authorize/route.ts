import {
  getCmsToken,
} from "@/app/api/cms/cms-middleware";
import { readMockState } from "@/services/carrier/oauth-flow";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";

// Renders the mock authorize HTML page. Backend-only — no React. Keeps the
// flow self-contained so we can ship the OAuth UX before any UI work, and
// makes the prod-cutover swap obvious (just delete this folder).
export async function GET(request: NextRequest) {
  if (process.env.PHASE2_USE_MOCK_OAUTH !== "true") {
    return new NextResponse("Mock OAuth disabled", { status: 403 });
  }

  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";

  // Auth check — only the original logged-in client should see their own
  // mock authorize screen.
  let clientId: string | null = null;
  try {
    const token = getCmsToken(request);
    const payload = jwt.verify(
      token,
      process.env.CMS_SECRET || ""
    ) as jwt.JwtPayload;
    clientId = (payload as any).clientId ?? null;
  } catch {
    return NextResponse.redirect(
      new URL("/zh-hk/login?reason=auth_required", request.url),
      302
    );
  }

  const mock = await readMockState(state);
  if (!mock || mock.client_id !== clientId) {
    return new NextResponse(
      htmlError(
        "MOCK 授權連結無效",
        "此連結可能已過期或不屬於目前登入帳號。"
      ),
      { status: 400, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  const html = renderPage({
    state,
    carrierName: `${mock.carrier_name_zh} (${mock.carrier_name_en})`,
    nickname: mock.nickname,
    scopes: mock.scopes,
  });
  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPage({
  state,
  carrierName,
  nickname,
  scopes,
}: {
  state: string;
  carrierName: string;
  nickname: string;
  scopes: string[];
}) {
  const scopeList = scopes
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("");
  return `<!doctype html>
<html lang="zh-HK">
<head>
  <meta charset="utf-8" />
  <title>[Mock] ${escapeHtml(carrierName)} 授權</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 24px; }
    .card { max-width: 480px; margin: 60px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,.04); }
    .badge { display: inline-block; background: #fff7ed; color: #9a3412; border: 1px solid #fed7aa; border-radius: 999px; padding: 2px 10px; font-size: 12px; margin-bottom: 16px; }
    h1 { margin: 0 0 16px; font-size: 22px; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 16px 0; }
    dt { color: #6b7280; font-size: 13px; }
    dd { margin: 0; font-size: 14px; }
    ul.scopes { background: #f3f4f6; border-radius: 8px; padding: 12px 16px 12px 32px; font-size: 13px; color: #374151; margin: 12px 0; }
    .actions { display: flex; gap: 12px; margin-top: 24px; }
    button { flex: 1; padding: 10px 16px; border-radius: 8px; font-size: 14px; cursor: pointer; border: none; }
    button.approve { background: #2563eb; color: #fff; }
    button.approve:hover { background: #1d4ed8; }
    button.deny { background: #fff; color: #374151; border: 1px solid #d1d5db; }
    button.deny:hover { background: #f9fafb; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .warn { background: #fef3c7; border: 1px solid #fde68a; color: #78350f; font-size: 13px; padding: 10px 14px; border-radius: 8px; margin-top: 16px; }
    .err { color: #b91c1c; margin-top: 12px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">⚠ MOCK 環境</span>
    <h1>授權 ${escapeHtml(carrierName)} 存取 ShipItAsia</h1>
    <p style="color:#6b7280; font-size: 14px; margin: 0 0 16px;">
      這是 dev/staging 環境的 OAuth 模擬流程。生產環境會跳轉到真實的 carrier 授權頁。
    </p>
    <dl>
      <dt>Carrier</dt><dd>${escapeHtml(carrierName)}</dd>
      <dt>暱稱</dt><dd>${escapeHtml(nickname)}</dd>
      <dt>應用程式</dt><dd>ShipItAsia v1</dd>
    </dl>
    <div>
      <div style="font-size:13px; color:#374151; margin-bottom:6px;">將授權以下範圍：</div>
      <ul class="scopes">${scopeList || "<li>(無 scopes)</li>"}</ul>
    </div>
    <div class="warn">
      將寫入的 access_token 前綴 <code>mock_fuuffy_</code>，prod 切換時必須清庫並請客戶重新綁定（spec §8.1.1）。
    </div>
    <div class="actions">
      <button class="deny" onclick="submit('deny')" id="btn-deny">模擬授權失敗</button>
      <button class="approve" onclick="submit('approve')" id="btn-approve">模擬授權成功</button>
    </div>
    <div class="err" id="err"></div>
  </div>
  <script>
    const STATE = ${JSON.stringify(state)};
    async function submit(action) {
      document.getElementById('btn-approve').disabled = true;
      document.getElementById('btn-deny').disabled = true;
      document.getElementById('err').textContent = '';
      try {
        const res = await fetch('/api/cms/carrier/oauth/mock-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ state: STATE, action }),
        });
        const data = await res.json();
        if (res.ok && data.data?.outcome === 'success') {
          window.location.href = '/zh-hk/carrier-accounts?success=1';
          return;
        }
        if (data.data?.outcome === 'user_denied') {
          window.location.href = '/zh-hk/carrier-accounts?error=user_denied';
          return;
        }
        document.getElementById('err').textContent = data.message || 'Failed';
        document.getElementById('btn-approve').disabled = false;
        document.getElementById('btn-deny').disabled = false;
      } catch (e) {
        document.getElementById('err').textContent = String(e);
        document.getElementById('btn-approve').disabled = false;
        document.getElementById('btn-deny').disabled = false;
      }
    }
  </script>
</body>
</html>`;
}

function htmlError(title: string, body: string) {
  return `<!doctype html>
<html lang="zh-HK">
<head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>body{font-family:sans-serif;background:#f9fafb;margin:0;padding:24px;}
.card{max-width:420px;margin:80px auto;background:#fff;border:1px solid #fecaca;border-radius:12px;padding:32px;}
h1{color:#b91c1c;margin:0 0 12px;font-size:20px;}p{color:#374151;font-size:14px;margin:0;}</style>
</head><body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></div></body></html>`;
}
