import { alreadySentNote, assistantReply, deliveryNote } from "./assistant.js";
import { rewriteHtml } from "./html.js";
import { buildLeadEmail, cleanPage, fingerprint, normalizeMessages } from "./lead.js";

let lastCaptured = null;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isLocal(request) {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function originAllowed(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

async function rateLimit(request, env) {
  if (!env.CHAT_RATE_LIMIT || typeof env.CHAT_RATE_LIMIT.limit !== "function") return true;
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const result = await env.CHAT_RATE_LIMIT.limit({ key: `chat:${ip}` });
  return Boolean(result && result.success);
}

async function verifyTurnstile(request, env, token) {
  const secret = env.TURNSTILE_SECRET || "";
  if (!secret) {
    return isLocal(request) ? { ok: true } : { ok: false, status: 503, error: "Chat is not configured yet. Please email connect@rockfortindustries.com." };
  }
  if (typeof token !== "string" || !token.trim() || token.length > 2048) {
    return { ok: false, status: 403, error: "Verification failed. Please try again." };
  }
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: request.headers.get("CF-Connecting-IP") || "",
      }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!result.success) return { ok: false, status: 403, error: "Verification failed. Please try again." };
    const allowed = String(env.TURNSTILE_HOSTNAMES || "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean);
    if (allowed.length && result.hostname && !allowed.includes(result.hostname)) {
      return { ok: false, status: 403, error: "Verification failed. Please try again." };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 403, error: "Verification could not be checked. Please try again." };
  }
}

async function deliver(email, env, request) {
  if (env.LEAD_SINK === "capture" && isLocal(request)) {
    lastCaptured = email;
    return { ok: true, captured: true };
  }
  if (!env.EMAIL || typeof env.EMAIL.send !== "function" || !env.LEAD_EMAIL || !env.LEAD_FROM) {
    return { ok: false };
  }
  try {
    await env.EMAIL.send({
      to: env.LEAD_EMAIL,
      from: { email: env.LEAD_FROM, name: "Rockfort Front Desk" },
      replyTo: email.replyTo,
      subject: email.subject,
      text: email.text,
    });
    return { ok: true };
  } catch (error) {
    const code = error && error.code ? error.code : "send-failed";
    console.error("lead email failed", code);
    return { ok: false };
  }
}

async function handleChat(request, env) {
  if (!originAllowed(request)) return json({ error: "This chat only accepts messages from the website." }, 403);
  if (!(await rateLimit(request, env))) {
    return json({ error: "Too many messages. Please wait a minute, or email connect@rockfortindustries.com." }, 429);
  }
  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return json({ error: "The message could not be read." }, 400);
  }
  if (raw.length > 80000) return json({ error: "That message is too large." }, 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "The message could not be read." }, 400);
  }
  const parsed = normalizeMessages(body.messages);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const turnstile = await verifyTurnstile(request, env, body.turnstileToken);
  if (!turnstile.ok) return json({ error: turnstile.error }, turnstile.status);
  const preference = body.language === "en" || body.language === "ms" ? body.language : "auto";
  const result = await assistantReply(parsed.messages, preference, env);
  const fp = fingerprint(result.lead);
  let emailSent = false;
  let notifiedFingerprint = typeof body.notifiedFingerprint === "string" ? body.notifiedFingerprint.slice(0, 40) : "";
  if (result.leadComplete && notifiedFingerprint === fp) {
    result.reply = alreadySentNote(result.language);
    emailSent = true;
  } else if (result.leadComplete) {
    const email = buildLeadEmail({
      to: env.LEAD_EMAIL || "",
      from: env.LEAD_FROM || "",
      lead: result.lead,
      transcript: parsed.messages.concat([{ role: "assistant", content: result.reply }]),
      page: cleanPage(body.page),
      language: result.language,
      receivedAt: new Date().toISOString(),
    });
    const sent = await deliver(email, env, request);
    emailSent = sent.ok;
    if (emailSent) notifiedFingerprint = fp;
    result.reply = `${result.reply}\n\n${deliveryNote(result.language, emailSent)}`;
  }
  return json({
    reply: result.reply,
    language: result.language,
    leadComplete: result.leadComplete,
    emailSent,
    notifiedFingerprint,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat-config" && request.method === "GET") {
      return json({ sitekey: env.TURNSTILE_SITEKEY || "" });
    }
    if (url.pathname === "/api/dev/lead-preview" && request.method === "GET") {
      if (!(env.LEAD_SINK === "capture" && isLocal(request))) return json({ error: "Not found" }, 404);
      return json({ email: lastCaptured });
    }
    if (url.pathname === "/api/chat" && request.method === "POST") return handleChat(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Not found", { status: 404 });
    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") return new Response("Not found", { status: 404 });
    const asset = await env.ASSETS.fetch(request);
    if (request.method === "HEAD") return asset;
    return rewriteHtml(asset);
  },
};
