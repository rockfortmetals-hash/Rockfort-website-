import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { scriptedReply, sanitizeReply } from "../src/assistant.js";
import { prepareHtml } from "../src/html.js";
import { buildLeadEmail, fingerprint, normalizeMessages } from "../src/lead.js";

const root = join(import.meta.dirname, "..");
const personalIntl = "+60" + "16" + "205" + "3556";
const personalLocal = ["016", "205", "3556"].join("-");
const privateInbox = ["rockfortmetals", "gmail.com"].join("@");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === ".wrangler") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

test("served pages do not contain the personal mobile or WhatsApp links", () => {
  const files = walk(root).filter((path) => /\.(html|css|js)$/.test(path) && !path.includes(`${join("src")}`) && !path.includes(`${join("test")}`));
  const banned = [personalIntl, personalLocal, "6016" + "2053556", "wa.me", "whatsapp-float", privateInbox];
  for (const path of files) {
    const text = readFileSync(path, "utf8");
    for (const needle of banned) {
      assert.equal(text.includes(needle), false, `${path} contains ${needle}`);
    }
  }
});

test("html rewrite strips a leftover WhatsApp button and injects the shared script", () => {
  const dirty = [
    "<html><body>",
    `<p>Phone: <a href="tel:${personalIntl}">${personalLocal} (Kana)</a></p>`,
    `<p>WhatsApp: <a href="https://wa.me/${personalIntl.replace("+", "")}">chat</a></p>`,
    `<a class="whatsapp-float" href="https://wa.me/${personalIntl.replace("+", "")}">float</a>`,
    `<script type="application/ld+json">{"telephone":"${personalIntl}","email":"connect@rockfortindustries.com"}</script>`,
    "<p>Call or WhatsApp Kana on , or email the workshop.</p>",
    "</body></html>",
  ].join("");
  const clean = prepareHtml(dirty);
  assert.equal(clean.includes("wa.me"), false);
  assert.equal(clean.includes(personalLocal), false);
  assert.equal(clean.includes(personalIntl), false);
  assert.equal(clean.includes("whatsapp-float"), false);
  assert.equal(clean.includes("telephone"), false);
  assert.match(clean, /\/js\/front-desk\.js/);
  assert.match(clean, /connect@rockfortindustries.com/);
});

test("a quote conversation collects a lead and the email is ready to quote", () => {
  const turns = [
    "Hi, can you thermal spray a worn pump shaft?",
    "Amir",
    "Delta Pumps Sdn Bhd",
    "012-345 6789",
    "skip",
    "Pump shaft, about 80mm journal, scored",
    "Journal is worn. Need metal spray and grinding. How much does it cost?",
    "Port Klang",
    "Shutdown this Friday",
    "skip",
  ];
  const messages = [{ role: "assistant", content: "Hello. I am the Rockfort front desk." }];
  let result;
  for (const turn of turns) {
    messages.push({ role: "user", content: turn });
    result = scriptedReply(messages, "en");
    messages.push({ role: "assistant", content: result.reply });
  }
  assert.equal(result.leadComplete, true);
  assert.equal(result.lead.name, "Amir");
  assert.equal(result.lead.company, "Delta Pumps Sdn Bhd");
  assert.match(result.lead.phone, /012-345 6789/);
  assert.equal(result.lead.email, "");
  assert.match(result.lead.part, /Pump shaft/);
  assert.match(result.lead.problem, /Journal is worn/);
  assert.equal(result.lead.location, "Port Klang");
  assert.match(result.lead.urgency, /Friday/);
  assert.equal(result.lead.photoDeclined, true);
  assert.match(messages.map((message) => message.content).join("\n"), /do not publish prices/i);
  assert.doesNotMatch(messages.map((message) => message.content).join("\n"), /\bRM\s*\d/);

  const email = buildLeadEmail({
    to: "lead-inbox@example.test",
    from: "quotes@rockfortindustries.com",
    lead: result.lead,
    transcript: messages,
    page: "/contact",
    language: "en",
    receivedAt: "2026-11-23T14:00:00.000Z",
  });
  assert.equal(email.to, "lead-inbox@example.test");
  assert.equal(email.replyTo, "connect@rockfortindustries.com");
  assert.match(email.subject, /Pump shaft/);
  assert.match(email.subject, /Delta Pumps/);
  assert.match(email.text, /READY TO QUOTE/);
  assert.match(email.text, /Name: Amir/);
  assert.match(email.text, /Company: Delta Pumps Sdn Bhd/);
  assert.match(email.text, /Phone: 012-345 6789/);
  assert.match(email.text, /Email: not provided/);
  assert.match(email.text, /Location: Port Klang/);
  assert.match(email.text, /Urgency: Shutdown this Friday/);
  assert.match(email.text, /Photo description: none/);
  assert.match(email.text, /Visitor: Amir/);
  assert.match(email.text, /Prices were not quoted/);
  assert.equal(email.text.includes(privateInbox), false);
  assert.equal(fingerprint(result.lead), fingerprint(result.lead));
  console.log("\n--- sample lead email ---\n" + email.text + "\n--- end sample lead email ---\n");
});

test("Bahasa Malaysia is detected and hard chrome is not claimed", () => {
  const messages = [
    { role: "assistant", content: "Helo." },
    { role: "user", content: "Boleh buat hard chrome untuk aci pam saya?" },
  ];
  const result = scriptedReply(messages, "auto");
  assert.equal(result.language, "ms");
  assert.match(result.reply, /tidak|tiada/i);
  assert.doesNotMatch(result.reply, /kami buat krom keras|we do hard chrome/i);
  assert.match(result.reply, /Boleh saya tahu nama anda/);
});

test("a made-up price from the model is replaced", () => {
  const safe = sanitizeReply("The coating costs RM 450 per inch.", "en");
  assert.match(safe, /do not publish prices/i);
  assert.doesNotMatch(safe, /450/);
});

test("oversized chats are rejected", () => {
  const huge = { error: true };
  const result = normalizeMessages([{ role: "user", content: "x".repeat(1501) }]);
  assert.equal(typeof result.error, "string");
  assert.equal(huge.error, true);
});
