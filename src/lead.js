const REQUIRED = ["name", "company", "phone", "part", "problem", "location", "urgency"];

export function clip(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max).trim() : text;
}

export function emptyLead() {
  return {
    name: "",
    company: "",
    phone: "",
    email: "",
    emailDeclined: false,
    part: "",
    problem: "",
    location: "",
    urgency: "",
    photoDescription: "",
    photoDeclined: false,
    notes: "",
  };
}

export function leadComplete(lead) {
  return REQUIRED.every((key) => lead[key] && String(lead[key]).trim()) && (lead.photoDescription || lead.photoDeclined);
}

export function fingerprint(lead) {
  const raw = [...REQUIRED.map((key) => lead[key] || ""), lead.notes || ""]
    .map((value) => String(value).trim().toLowerCase())
    .join("|");
  let hash = 5381;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export function normalizeMessages(input) {
  if (!Array.isArray(input)) return { error: "Send the conversation as a list of messages." };
  if (input.length > 30) {
    return { error: "This chat is too long. Please email connect@rockfortindustries.com." };
  }
  const messages = [];
  let total = 0;
  for (const message of input) {
    if (!message || (message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") {
      return { error: "A message was not valid." };
    }
    const content = message.content.trim();
    if (!content) continue;
    if (content.length > 1500) return { error: "Please keep each message under 1,500 characters." };
    total += content.length;
    if (total > 16000) return { error: "This chat is too long. Please email connect@rockfortindustries.com." };
    messages.push({ role: message.role, content });
  }
  if (!messages.some((message) => message.role === "user")) return { error: "Type a message to start." };
  return { messages };
}

export function cleanPage(page) {
  if (typeof page !== "string") return "";
  const trimmed = page.trim().slice(0, 200);
  if (!trimmed.startsWith("/") || trimmed.includes("://") || trimmed.includes("\\")) return "";
  return trimmed;
}

function oneLine(value) {
  return clip(String(value || "").replace(/[\r\n\t]+/g, " "), 140);
}

export function buildLeadEmail({ to, from, lead, transcript, page, language, receivedAt }) {
  const emailLine = lead.email ? lead.email : "not provided";
  const photoLine = lead.photoDescription ? lead.photoDescription : "none";
  const lines = [
    "New quote request — Rockfort Metal Coating",
    `Received: ${receivedAt}`,
    `Page: ${page || "—"}`,
    `Language: ${language === "ms" ? "Bahasa Malaysia" : "English"}`,
    "",
    "READY TO QUOTE",
    `Name: ${lead.name || "—"}`,
    `Company: ${lead.company || "—"}`,
    `Phone: ${lead.phone || "—"}`,
    `Email: ${emailLine}`,
    `Part / equipment: ${lead.part || "—"}`,
    `Problem / service: ${lead.problem || "—"}`,
    `Location: ${lead.location || "—"}`,
    `Urgency: ${lead.urgency || "—"}`,
    `Photo description: ${photoLine}`,
  ];
  if (lead.notes) lines.push(`Later notes: ${lead.notes}`);
  lines.push("", "TRANSCRIPT");
  for (const message of transcript) {
    const who = message.role === "user" ? "Visitor" : "Front desk";
    lines.push(`${who}: ${message.content}`, "");
  }
  lines.push("Prices were not quoted in this chat. The team should price the job.");
  const part = oneLine(lead.part) || "part not named";
  const company = oneLine(lead.company) || "company not named";
  return {
    to,
    from,
    replyTo: "connect@rockfortindustries.com",
    subject: `Quote request: ${part} — ${company}`,
    text: lines.join("\n"),
  };
}
