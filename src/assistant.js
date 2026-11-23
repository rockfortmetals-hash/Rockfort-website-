import { KNOWLEDGE, PUBLIC_EMAIL } from "./knowledge.js";
import { clip, emptyLead, leadComplete } from "./lead.js";

const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const BANNED_INBOX = "rockfortmetals" + "@" + "gmail.com";
const PHONE_DIGITS = new RegExp("\\+?\\s*60\\s*16\\s*205\\s*3556|016" + "[-.\\s]?" + "205" + "[-.\\s]?" + "3556", "i");
const PRICE = /\b(rm|myr|usd|sgd)\s*\d|\b\d[\d,]*\s*(rm|ringgit|myr)\b|\$\s*\d|\bprice is\b|\bcosts?\s+\d/i;

const ASK = [
  ["name", /may i have your name|boleh saya tahu nama anda/i],
  ["company", /which company is this for|syarikat mana/i],
  ["phone", /what phone number|nombor telefon apa/i],
  ["email", /email address is optional|e-mel tidak wajib/i],
  ["part", /what part or equipment|komponen atau peralatan apa/i],
  ["problem", /what is the problem|apakah masalahnya/i],
  ["location", /where is the equipment located|di mana peralatan itu/i],
  ["urgency", /how urgent is the job|seberapa segera kerja/i],
  ["photo", /if you have a photo|jika anda ada gambar/i],
];

const COPY = {
  en: {
    name: "May I have your name?",
    company: "Which company is this for?",
    phone: "What phone number should the workshop use to reach you?",
    email: "An email address is optional. Share one, or say skip.",
    part: "What part or equipment is it?",
    problem: "What is the problem, or which service do you need?",
    location: "Where is the equipment located?",
    urgency: "How urgent is the job?",
    photo: "If you have a photo, describe it in a sentence or two. Otherwise say skip.",
    price: "We do not publish prices. The workshop will quote once they know the part and the job.",
    unknown: "I can only answer from the services published on this site: thermal spray, dynamic balancing, fabrication and machining, and industrial coating. The workshop can confirm anything else when they quote.",
    sent: "I have sent this request to the workshop team.",
    already: "This request is already with the workshop. If something needs correcting, type it and I will send an update.",
    mailFail: `The workshop inbox is not ready to receive this automatically. Please email ${PUBLIC_EMAIL} with the details above.`,
  },
  ms: {
    name: "Boleh saya tahu nama anda?",
    company: "Syarikat mana yang membuat pertanyaan ini?",
    phone: "Nombor telefon apa yang boleh digunakan oleh bengkel?",
    email: "E-mel tidak wajib. Berikan satu, atau taip skip.",
    part: "Komponen atau peralatan apa yang terlibat?",
    problem: "Apakah masalahnya, atau servis apa yang diperlukan?",
    location: "Di mana peralatan itu berada?",
    urgency: "Seberapa segera kerja ini?",
    photo: "Jika anda ada gambar, huraikan dalam satu atau dua ayat. Jika tidak, taip skip.",
    price: "Kami tidak umumkan harga. Bengkel akan beri sebut harga selepas tahu komponen dan kerja yang diperlukan.",
    unknown: "Saya hanya boleh jawab berdasarkan servis yang disiarkan di laman ini: semburan haba, pengimbangan dinamik, fabrikasi dan pemesinan, serta salutan industri. Bengkel boleh sahkan perkara lain semasa sebut harga.",
    sent: "Saya sudah hantar permintaan ini kepada pasukan bengkel.",
    already: "Permintaan ini sudah ada pada bengkel. Jika ada pembetulan, taip sahaja dan saya akan hantar kemas kini.",
    mailFail: `Peti e-mel bengkel belum sedia untuk terima ini secara automatik. Sila e-mel ${PUBLIC_EMAIL} dengan butiran di atas.`,
  },
};

const TOPICS = [
  {
    id: "chrome",
    test: /hard chrome|brush plat|saduran krom|krom keras/i,
    en: "Hard chrome and brush plating are not on the published service list. The workshop publishes thermal spray (metal spray), dynamic balancing, fabrication and machining, and industrial coating. The team can confirm the right process when they quote.",
    ms: "Saduran krom keras dan brush plating tiada dalam senarai servis yang disiarkan. Servis yang disiarkan ialah semburan haba (metal spray), pengimbangan dinamik, fabrikasi dan pemesinan, serta salutan industri. Pasukan boleh sahkan proses yang sesuai semasa sebut harga.",
  },
  {
    id: "cert",
    test: /certif|iso\b|warranty|jaminan/i,
    en: "Certifications, ISO, and warranties are not published on the site. The workshop can discuss them when they quote.",
    ms: "Pensijilan, ISO, dan jaminan tidak disiarkan di laman ini. Bengkel boleh bincangkannya semasa sebut harga.",
  },
  {
    id: "balancing",
    test: /dynamic balanc|pengimbang|balancing/i,
    en: "Dynamic balancing covers rotating parts up to 4,000 RPM, including rotors, impellers, mechanical turbines, motor and pump shafts, and ID fans. The site says it improves running conditions, performance, and service life.",
    ms: "Pengimbangan dinamik dibuat untuk komponen berputar sehingga 4,000 RPM, termasuk rotor, impeller, turbin mekanikal, aci motor dan pam, serta kipas ID. Laman ini menyatakan ia memperbaiki keadaan jalan, prestasi, dan jangka hayat.",
  },
  {
    id: "thermal",
    test: /thermal spray|metal spray|semburan haba|semburan logam/i,
    en: "Yes. Thermal spray, also called metal spray, restores a damaged component to OEM specifications or applies a protective layer. It is used for pumps, motors, shafts, and other industrial parts. Shaft journals are rebuilt by metal spray and then precision-ground. Machining stays in the same Klang workshop. Materials listed include carbon steel, aluminium, stainless steel, bronze, Inconel, Babbitt, nickel alloys, and Hastelloy.",
    ms: "Boleh. Semburan haba, atau metal spray, membaiki komponen yang rosak supaya kembali ke spesifikasi OEM, atau mengenakan lapisan pelindung. Ia digunakan untuk pam, motor, aci, dan komponen industri lain. Jurnal aci dibina semula dengan metal spray, kemudian dikisar tepat. Pemesinan dibuat di bengkel Klang yang sama. Bahan yang disenaraikan termasuk keluli karbon, aluminium, keluli tahan karat, gangsa, Inconel, Babbitt, aloi nikel, dan Hastelloy.",
  },
  {
    id: "coating",
    test: /industrial coating|ceramic coating|impeller coating|salutan|pump casing/i,
    en: "Industrial coating rebuilds and protects parts against erosion and corrosion, and can improve efficiency. Typical jobs are impeller coating, pump casings, and internal pipes. The gallery shows a corroded pump impeller refinished with a protective ceramic coating.",
    ms: "Salutan industri membina semula dan melindungi komponen daripada hakisan dan kakisan, dan boleh menambah kecekapan. Kerja biasa ialah salutan impeller, selongsong pam, dan paip dalaman. Galeri menunjukkan impeller pam yang berkarat disiapkan dengan salutan seramik pelindung.",
  },
  {
    id: "fabrication",
    test: /fabricat|machining|kimpalan|fabrikasi|welding|\blathe\b|milling/i,
    en: "Fabrication and machining are done in-house from engineering drawings or samples, with lathe and milling. The site lists shafts, frames, jigs, fixtures, panels, ID fans, and other custom parts. Welding methods are MIG, TIG, ARC, and powder fusing. Suitable jobs have no minimum order quantity.",
    ms: "Fabrikasi dan pemesinan dibuat sendiri daripada lukisan kejuruteraan atau sampel, dengan mesin larik dan pemesinan. Laman ini menyenaraikan aci, rangka, jig, lekapan, panel, kipas ID, dan alat khas yang lain. Kimpalan: MIG, TIG, ARC, dan powder fusing. Kerja yang sesuai tiada kuantiti pesanan minimum.",
  },
  {
    id: "onsite",
    test: /on-?site|di tapak|site visit/i,
    en: "The gallery shows on-site work, including a stainless steel strainer basket that was fabricated and installed on site. The site also lists after-hours and shutdown support. Whether a visit is possible is confirmed when the workshop quotes.",
    ms: "Galeri menunjukkan kerja di tapak, termasuk bakul penapis keluli tahan karat yang difabrikasi dan dipasang di tapak. Laman ini juga menyenaraikan sokongan luar waktu dan shutdown. Lawatan disahkan semasa bengkel memberi sebut harga.",
  },
  {
    id: "materials",
    test: /inconel|hastelloy|babbitt|what material|bahan apa/i,
    en: "Published spray and coating materials are carbon steel, aluminium, stainless steel, bronze, Inconel, Babbitt, nickel alloys, Hastelloy, and other materials suited to the part.",
    ms: "Bahan semburan dan salutan yang disiarkan ialah keluli karbon, aluminium, keluli tahan karat, gangsa, Inconel, Babbitt, aloi nikel, Hastelloy, dan bahan lain yang sesuai dengan komponen.",
  },
  {
    id: "industries",
    test: /which industr|industries|oil & gas|marine|food industry|sektor/i,
    en: "Published industries are general engineering, power plants, shipyard and marine, food, oil and gas, and water and waste management, including Indah Water. The homepage also mentions Siemens among more than 300 clients.",
    ms: "Industri yang disiarkan ialah kejuruteraan am, loji kuasa, limbungan dan marin, makanan, minyak dan gas, serta air dan sisa, termasuk Indah Water. Laman utama juga menyebut Siemens antara lebih 300 pelanggan.",
  },
  {
    id: "location",
    test: /where are you|your address|alamat|lokasi bengkel|where is the workshop/i,
    en: `The workshop is Rockfort Metal Coating Sdn Bhd, No.11, Kawasan Perindustrian Sungai Rasau, Jalan 39/16, Off Connaught Bridge, 41300 Klang, Selangor, Malaysia. The public email is ${PUBLIC_EMAIL}.`,
    ms: `Bengkel Rockfort Metal Coating Sdn Bhd ada di No.11, Kawasan Perindustrian Sungai Rasau, Jalan 39/16, Off Connaught Bridge, 41300 Klang, Selangor, Malaysia. E-mel awam ialah ${PUBLIC_EMAIL}.`,
  },
  {
    id: "hours",
    test: /after-?hours|shutdown|working hours|waktu bekerja/i,
    en: "The site offers after-hours and shutdown support when a stoppage cannot wait for a normal working day. Exact hours are not published.",
    ms: "Laman ini menawarkan sokongan luar waktu dan shutdown apabila henti kerja tidak boleh tunggu hari biasa. Waktu tepat tidak disiarkan.",
  },
  {
    id: "about",
    test: /who are you|about the company|tentang syarikat|founded|ditubuhkan/i,
    en: "Rockfort Metal Coating Sdn Bhd was founded in 2003 in Sungai Rasau Industrial Park, Klang. The site describes a team of about 20 people, over 20 years of experience, and a one-stop workshop for repair, rebuild, balancing, and coating. Managing Director: Perumal Kaliaperumal.",
    ms: "Rockfort Metal Coating Sdn Bhd ditubuhkan pada 2003 di Taman Perindustrian Sungai Rasau, Klang. Laman ini menerangkan pasukan kira-kira 20 orang, lebih 20 tahun pengalaman, dan bengkel sehenti untuk baiki, bina semula, pengimbangan, dan salutan. Pengarah Urusan: Perumal Kaliaperumal.",
  },
  {
    id: "leadtime",
    test: /lead time|how long|berapa lama|masa siap/i,
    en: "A lead time is not published. The workshop will say what is possible when they quote, including shutdown support when the job cannot wait.",
    ms: "Tempoh siap tidak disiarkan. Bengkel akan beritahu apa yang mungkin semasa sebut harga, termasuk sokongan shutdown jika kerja tidak boleh tunggu.",
  },
  {
    id: "minimum",
    test: /minimum order|kuantiti minimum/i,
    en: "The fabrication page says there is no minimum order quantity for suitable jobs.",
    ms: "Halaman fabrikasi menyatakan tiada kuantiti pesanan minimum untuk kerja yang sesuai.",
  },
];

function copy(lang) {
  return COPY[lang] || COPY.en;
}

export function resolveLanguage(messages, preference) {
  if (preference === "en" || preference === "ms") return preference;
  let language = "en";
  const malay = /\b(saya|anda|boleh|harga|sebut|bengkel|pam|aci|segera|lokasi|syarikat|tolong|berapa|tak|tidak|sila|macam|mana|servis|nak|perlu|rosak|haus|hantar|bahan)\b/gi;
  for (const message of messages) {
    if (message.role !== "user") continue;
    const hits = message.content.match(malay);
    if (hits && hits.length >= 2) language = "ms";
  }
  return language;
}

function isQuestion(text) {
  return /\?|\b(what|how|can you|do you|where|when|why|which|who|berapa|boleh|adakah|apakah|di mana|macam mana)\b/i.test(text);
}

function priceIntent(text) {
  return /\b(how much|price|prices|quotation|cost|harga|sebut harga|berapa)\b/i.test(text);
}

function isSkip(text) {
  return /^(skip|no|none|nope|n\/a|na|tiada|tak ada|tak perlu|tidak|tidak ada|x|-|no photo|no email|no thanks|tak nak|tak ada gambar|tiada gambar)\b/i.test(text.trim());
}

function findEmail(text) {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : "";
}

function findPhone(text) {
  const match = text.match(/\+?\d[\d\s\-()]{7,18}/);
  if (!match) return "";
  const digits = match[0].replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  return match[0].trim();
}

function stripPriceTail(text) {
  return text.replace(/\s*(how much[\s\S]*|what(?:'s| is) the (?:price|cost)[\s\S]*|berapa[\s\S]*)$/i, "").trim();
}

export function detectAskedField(content) {
  let found = null;
  let at = -1;
  for (const [field, pattern] of ASK) {
    const match = String(content || "").match(pattern);
    if (match && match.index >= at) {
      at = match.index;
      found = field;
    }
  }
  return found;
}

function answerQuestion(text, lang) {
  if (priceIntent(text)) return copy(lang).price;
  for (const topic of TOPICS) {
    if (topic.test.test(text)) return topic[lang] || topic.en;
  }
  return "";
}

function applyAnswer(lead, field, text) {
  const cleaned = stripPriceTail(text).trim();
  if (field === "email") {
    if (isSkip(text)) {
      lead.emailDeclined = true;
      return;
    }
    const email = findEmail(text);
    if (email) lead.email = email;
    return;
  }
  if (field === "photo") {
    if (isSkip(text)) {
      lead.photoDeclined = true;
      return;
    }
    lead.photoDescription = clip(cleaned || text, 800);
    return;
  }
  if (field === "phone") {
    const phone = findPhone(text);
    if (phone) lead.phone = phone;
    return;
  }
  if (isQuestion(text) && cleaned.length < 2) return;
  const value = clip(cleaned || text, 300);
  if (value.length < 2) return;
  if (field === "name" && (findPhone(text) || findEmail(text) || isQuestion(text))) return;
  lead[field] = value;
}

export function reconstructLead(messages) {
  const lead = emptyLead();
  let pending = null;
  for (const message of messages) {
    if (message.role === "assistant") {
      pending = detectAskedField(message.content);
      continue;
    }
    if (message.role !== "user") continue;
    const text = message.content.trim();
    if (!lead.email) {
      const email = findEmail(text);
      if (email) lead.email = email;
    }
    if (pending) {
      applyAnswer(lead, pending, text);
      pending = null;
      continue;
    }
    if (leadComplete(lead) && !isSkip(text)) {
      lead.notes = clip(lead.notes ? `${lead.notes}\n${text}` : text, 800);
    }
  }
  return lead;
}

function nextQuestion(lead, lang) {
  const text = copy(lang);
  if (!lead.name) return text.name;
  if (!lead.company) return text.company;
  if (!lead.phone) return text.phone;
  if (!lead.email && !lead.emailDeclined) return text.email;
  if (!lead.part) return text.part;
  if (!lead.problem) return text.problem;
  if (!lead.location) return text.location;
  if (!lead.urgency) return text.urgency;
  if (!lead.photoDescription && !lead.photoDeclined) return text.photo;
  return "";
}

function summary(lead, lang) {
  const email = lead.email || (lang === "ms" ? "tidak diberikan" : "not provided");
  const photo = lead.photoDescription || (lang === "ms" ? "tiada" : "none");
  if (lang === "ms") {
    return [
      "Terima kasih. Ini permintaan untuk bengkel. Mereka akan beri sebut harga. Harga tidak disiarkan.",
      `Nama: ${lead.name}`,
      `Syarikat: ${lead.company}`,
      `Telefon: ${lead.phone}`,
      `E-mel: ${email}`,
      `Komponen / peralatan: ${lead.part}`,
      `Masalah / servis: ${lead.problem}`,
      `Lokasi: ${lead.location}`,
      `Segera: ${lead.urgency}`,
      `Gambar: ${photo}`,
    ].join("\n");
  }
  return [
    "Thank you. This is the request for the workshop. They will quote it. Prices are not published.",
    `Name: ${lead.name}`,
    `Company: ${lead.company}`,
    `Phone: ${lead.phone}`,
    `Email: ${email}`,
    `Part / equipment: ${lead.part}`,
    `Problem / service: ${lead.problem}`,
    `Location: ${lead.location}`,
    `Urgency: ${lead.urgency}`,
    `Photo: ${photo}`,
  ].join("\n");
}

export function scriptedReply(messages, preference) {
  const language = resolveLanguage(messages, preference);
  const lead = reconstructLead(messages);
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const text = lastUser ? lastUser.content.trim() : "";
  const asked = isQuestion(text);
  const knowledge = asked ? answerQuestion(text, language) : "";
  const question = nextQuestion(lead, language);
  const parts = [];
  if (knowledge) parts.push(knowledge);
  else if (asked) parts.push(copy(language).unknown);
  if (question) parts.push(question);
  else parts.push(summary(lead, language));
  return {
    reply: parts.filter(Boolean).join("\n\n"),
    question,
    lead,
    leadComplete: !question,
    language,
    userAsked: asked,
  };
}

export function sanitizeReply(text, language) {
  if (typeof text !== "string") return "";
  let cleaned = text.replace(/```[\s\S]*?```/g, "").trim();
  if (!cleaned) return "";
  if (PRICE.test(cleaned)) return copy(language).price;
  if (PHONE_DIGITS.test(cleaned) || /wa\.me|api\.whatsapp\.com/i.test(cleaned)) return "";
  if (cleaned.toLowerCase().includes(BANNED_INBOX)) return "";
  if (/we (do|offer|provide) hard chrome|brush plating is available/i.test(cleaned)) return "";
  if (cleaned.length > 1200) cleaned = `${cleaned.slice(0, 1200).trim()}…`;
  return cleaned;
}

export function parseAiText(result) {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (typeof result.response === "string") return result.response;
  if (typeof result.result === "string") return result.result;
  const choice = result.choices && result.choices[0];
  if (choice && choice.message && typeof choice.message.content === "string") return choice.message.content;
  if (choice && typeof choice.text === "string") return choice.text;
  return "";
}

function aiMessages(messages, language) {
  const langName = language === "ms" ? "Bahasa Malaysia" : "English";
  return [
    {
      role: "system",
      content: `You are the front desk for Rockfort Metal Coating Sdn Bhd in Klang, Selangor, Malaysia. Answer only from the facts below. If a fact is not listed, say it is not published and the workshop can confirm it when they quote. Never invent prices, lead times, certifications, warranties, phone numbers, or processes that are not listed. For any price question, say the team will quote and that prices are not published. Reply in ${langName}. Keep the reply under 120 words. Do not ask for the visitor's contact details.

FACTS:
${KNOWLEDGE}`,
    },
    ...messages.filter((message) => message.role === "user" || message.role === "assistant").slice(-8),
  ];
}

export async function assistantReply(messages, preference, env) {
  const scripted = scriptedReply(messages, preference);
  if (scripted.leadComplete || !scripted.userAsked) return scripted;
  if (!env || env.ASSISTANT_MODE === "scripted" || !env.AI || typeof env.AI.run !== "function") return scripted;
  try {
    const result = await env.AI.run(MODEL, {
      messages: aiMessages(messages, scripted.language),
      max_tokens: 400,
      chat_template_kwargs: { enable_thinking: false },
    });
    const safe = sanitizeReply(parseAiText(result), scripted.language);
    if (!safe) return scripted;
    const reply = scripted.question ? `${safe}\n\n${scripted.question}` : safe;
    return { ...scripted, reply };
  } catch (error) {
    console.error("workers ai fallback", error && error.message ? "failed" : "failed");
    return scripted;
  }
}

export function deliveryNote(language, sent) {
  const text = copy(language);
  return sent ? text.sent : text.mailFail;
}

export function alreadySentNote(language) {
  return copy(language).already;
}
