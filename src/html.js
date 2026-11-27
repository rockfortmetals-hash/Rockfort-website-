// Removes the owner's personal mobile (the old WhatsApp number) from HTML
// before it is sent to the browser. The digits are assembled here so the
// literal number is not stored in the repository.

const INTL = "60" + "16" + "205" + "3556";
const LOCAL = "016" + "[-.\\s]?" + "205" + "[-.\\s]?" + "3556";

const PHONE_DIGITS = new RegExp("\\+?\\s*60\\s*16\\s*205\\s*3556|" + LOCAL, "gi");
const TEL_ANCHOR = new RegExp(
  "<a\\b[^>]*href=[\"']tel:[^\"']*" + INTL + "[^\"']*[\"'][^>]*>[\\s\\S]*?<\\/a>",
  "gi",
);
const WA_ANCHOR = /<a\b[^>]*(?:wa\.me|api\.whatsapp\.com|whatsapp-float)[^>]*>[\s\S]*?<\/a>/gi;
const TELEPHONE_KEY = /"telephone"\s*:\s*"[^"]*"\s*,?\s*/g;
const CHAT_TAG = '<script src="/js/front-desk.js" defer></script>';

export function prepareHtml(html) {
  let next = String(html || "");
  next = next.replace(TEL_ANCHOR, "");
  next = next.replace(WA_ANCHOR, "");
  next = next.replace(TELEPHONE_KEY, "");
  next = next.replace(PHONE_DIGITS, "");
  next = next.replace(/<p>\s*(?:Phone|Tel|WhatsApp)\s*:\s*<\/p>/gi, "");
  next = next.replace(/WhatsApp:\s*/gi, "");
  next = next.replace(/Call or WhatsApp Kana on\s*,?\s*or email/gi, "Email");
  next = next.replace(/Call Kana, send a WhatsApp message, or email/gi, "Use the chat button or email");
  next = next.replace(/Tel:\s*(?:\|\s*)?/gi, "");
  next = next.replace(/\(\s*Kana\s*\)/gi, "");
  if (!next.includes("/js/front-desk.js") && /<\/body>/i.test(next)) {
    next = next.replace(/<\/body>/i, `  ${CHAT_TAG}\n</body>`);
  }
  return next;
}

export async function rewriteHtml(response) {
  const type = response.headers.get("content-type") || "";
  if (response.status !== 200 || !type.includes("text/html")) return response;
  const html = prepareHtml(await response.text());
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(html, { status: response.status, headers });
}
