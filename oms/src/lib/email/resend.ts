import { Resend } from "resend";

let cachedClient: Resend | null = null;

function getClient(): Resend {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_NOT_CONFIGURED: set RESEND_API_KEY env (free tier: https://resend.com)"
    );
  }
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  resendId: string;
  sentAt: Date;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new Error("RESEND_FROM_EMAIL_MISSING: set RESEND_FROM_EMAIL env");
  }
  const client = getClient();
  const result = await client.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
  });
  if (result.error) {
    throw new Error(
      `RESEND_SEND_FAILED: ${result.error.name} — ${result.error.message}`
    );
  }
  if (!result.data?.id) {
    throw new Error("RESEND_SEND_FAILED: no id returned");
  }
  return { resendId: result.data.id, sentAt: new Date() };
}
