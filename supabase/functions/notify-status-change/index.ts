// [Claude 추가] 상태 변경 알림 - admin.html에서 신청 상태 변경 성공 직후 호출
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// [Claude 추가] 협약서 PDF - hyunra.kr에 배포된 정적 파일을 발송 시점에 불러와 첨부함.
// 파일이 아직 배포되지 않았거나 일시적으로 못 불러와도 이메일 자체는 정상 발송되고 쳄부만 빠짐(조용히 실패).
const AGREEMENT_PDF_URL = "https://hyunra.kr/khp/assets/agreement_template.pdf";
const AGREEMENT_PDF_FILENAME = "국가인적자원개발컨소시엄_협약서_및_협약기업_일반현황.pdf";
const ATTACH_ON_STATUSES = ["승인", "신청확정"];

async function getAgreementAttachment(): Promise<{ filename: string; content: string }[] | undefined> {
  try {
    const res = await fetch(AGREEMENT_PDF_URL);
    if (!res.ok) return undefined;
    const buf = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < buf.length; i += chunkSize) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunkSize));
    }
    return [{ filename: AGREEMENT_PDF_FILENAME, content: btoa(binary) }];
  } catch (_e) {
    return undefined;
  }
}

// [Claude 추가] 발신 주소(hyunra.kr)에는 실제 메일함이 없으므로, 신청자가 "답장"을 누르면
// 실제 관리자 메일(RESEND_REPLY_TO, 미설정 시 jjmbckdp1@gmail.com)로 가도록 reply_to 지정
async function sendEmail(to: string, subject: string, html: string, attachments?: { filename: string; content: string }[]) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") || "onboarding@resend.dev";
  const replyTo = Deno.env.get("RESEND_REPLY_TO") || "jjmbckdp1@gmail.com";
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not set" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, reply_to: replyTo, ...(attachments && attachments.length ? { attachments } : {}) }),
  });
  const resBody = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: JSON.stringify(resBody) };
  return { ok: true };
}

async function sendSms(to: string, msg: string) {
  const userId = Deno.env.get("ALIGO_USER_ID");
  const apiKey = Deno.env.get("ALIGO_API_KEY");
  const sender = Deno.env.get("ALIGO_SENDER");
  if (!userId || !apiKey || !sender) return { ok: false, error: "ALIGO secrets not set" };
  const cleanTo = to.replace(/[^0-9]/g, "");
  const form = new URLSearchParams({
    key: apiKey,
    user_id: userId,
    sender,
    receiver: cleanTo,
    msg,
    testmode_yn: "N",
  });
  const res = await fetch("https://apis.aligo.in/send/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const resBody = await res.json().catch(() => ({}));
  if (!res.ok || Number((resBody as any).result_code) < 0) {
    return { ok: false, error: JSON.stringify(resBody) };
  }
  return { ok: true };
}

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function logNotification(row: Record<string, unknown>) {
  await sb.from("notification_log").insert(row);
}

async function isChannelEnabled(eventType: string, channel: string): Promise<boolean> {
  const { data } = await sb
    .from("notification_settings")
    .select("enabled")
    .eq("event_type", eventType)
    .eq("channel", channel)
    .maybeSingle();
  return data ? Boolean((data as any).enabled) : true;
}

async function getTemplate(eventType: string, channel: string, detail = "") {
  const { data } = await sb
    .from("notification_templates")
    .select("subject, body")
    .eq("event_type", eventType)
    .eq("channel", channel)
    .eq("detail", detail)
    .maybeSingle();
  return data as { subject: string | null; body: string } | null;
}
function applyVars(str: string, vars: Record<string, string>) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}
function toHtml(text: string) {
  return text.split("\n").map((line) => `<p>${line}</p>`).join("");
}

const FALLBACK_TEMPLATES: Record<string, { subject: string; body: string }> = {
  "승인": { subject: "교육 신청이 승인되었습니다", body: "신청이 승인되었습니다. 추후 수강 확정 안내를 기다려주세요." },
  "신청확정": { subject: "수강이 확정되었습니다", body: "수강이 확정되었습니다. 교육 일정에 맞추여 참석해주세요." },
  "수료": { subject: "교육을 수료하셔습니다", body: "교육을 수료하셔습니다. 수고하셨습니다." },
  "거절": { subject: "교육 신청 결과 안내", body: "안내드립니다. 이번 신청은 반영되지 못했습니다." },
  "취소": { subject: "교육 신청이 취소되었습니다", body: "신청이 취소 처리되었습니다." },
  "중복신청": { subject: "중복 신청 안내", body: "중복 신청으로 확인되어 처리되었습니다." },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: identity, error: authError } = await sb.auth.getUser(token);
    if (authError || !identity.user?.email) return json({ error: "unauthorized" }, 401);
    const { data: admin, error: adminError } = await sb.from("admins").select("email").eq("email", identity.user.email).maybeSingle();
    if (adminError || !admin) return json({ error: "forbidden" }, 403);
    const { applicationId, notifyCompletion } = await req.json();
    if (!applicationId) return json({ error: "applicationId required" }, 400);

    const { data: app, error } = await sb
      .from("applications")
      .select(
        "id, status, trainee_id, trainees(name, phone, email), courses(name, start_date, course_types(name))",
      )
      .eq("id", applicationId)
      .maybeSingle();
    if (error || !app) return json({ error: error?.message || "not found" }, 404);

    const status = (app as any).status as string;
    if (status === "수료" && notifyCompletion !== true) return json({ ok: true, skipped: true, reason: "completion_requires_opt_in" });
    const fallback = FALLBACK_TEMPLATES[status];
    if (!fallback) return json({ ok: true, skipped: true, reason: `no template for status ${status}` });

    const trainee = (app as any).trainees;
    const course = (app as any).courses;
    const courseName = course ? `${course.course_types?.name ?? ""} ${course.name}`.trim() : "";
    const vars = { name: trainee?.name ?? "", course: courseName, start_date: course?.start_date ?? "" };

    const tplEmail = await getTemplate("status_change", "email", status);
    const subject = tplEmail?.subject ? applyVars(tplEmail.subject, vars) : `[${courseName}] ${fallback.subject}`;
    const html = tplEmail?.body
      ? toHtml(applyVars(tplEmail.body, vars))
      : `<p>${trainee?.name ?? ""}님, 안녕하세요.</p><p><strong>${courseName}</strong> 과정: ${fallback.body}</p>`;

    const tplSms = await getTemplate("status_change", "sms", status);
    const smsMsg = tplSms?.body ? applyVars(tplSms.body, vars) : `[${courseName}] ${trainee?.name ?? ""}님, ${fallback.body}`;

    // [Claude 추가] 승인/신청확정 상태일 때만 협약서 PDF 첨부
    const attachments = ATTACH_ON_STATUSES.includes(status) ? await getAgreementAttachment() : undefined;

    if (trainee?.email) {
      if (await isChannelEnabled("status_change", "email")) {
        const r = await sendEmail(trainee.email, subject, html, attachments);
        await logNotification({
          application_id: applicationId,
          trainee_id: (app as any).trainee_id,
          event_type: "status_change",
          channel: "email",
          status: r.ok ? "sent" : "failed",
          recipient: trainee.email,
          detail: status,
          error_message: r.ok ? null : r.error,
        });
      } else {
        await logNotification({
          application_id: applicationId,
          trainee_id: (app as any).trainee_id,
          event_type: "status_change",
          channel: "email",
          status: "skipped",
          recipient: trainee.email,
          detail: status,
        });
      }
    }
    if (status !== "수료" && trainee?.phone) {
      if (await isChannelEnabled("status_change", "sms")) {
        const r = await sendSms(trainee.phone, smsMsg);
        await logNotification({
          application_id: applicationId,
          trainee_id: (app as any).trainee_id,
          event_type: "status_change",
          channel: "sms",
          status: r.ok ? "sent" : "failed",
          recipient: trainee.phone,
          detail: status,
          error_message: r.ok ? null : r.error,
        });
      } else {
        await logNotification({
          application_id: applicationId,
          trainee_id: (app as any).trainee_id,
          event_type: "status_change",
          channel: "sms",
          status: "skipped",
          recipient: trainee.phone,
          detail: status,
        });
      }
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

