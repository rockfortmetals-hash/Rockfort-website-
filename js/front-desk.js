(function () {
  if (window.__rockfortFrontDesk) return;
  window.__rockfortFrontDesk = true;

  var STORAGE_KEY = "rockfort-front-desk-v1";
  var state = {
    messages: [],
    language: "auto",
    notifiedFingerprint: "",
    sitekey: "",
    widgetId: null,
    sending: false,
  };

  function greeting(language) {
    if (language === "ms") {
      return "Helo. Saya kaunter hadapan Rockfort. Saya boleh jawab soalan tentang bengkel di Klang dan ambil permintaan sebut harga. Apa yang anda perlukan?";
    }
    return "Hello. I am the Rockfort front desk. I can answer questions about the Klang workshop and take a quote request. What do you need help with?";
  }

  function loadState() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (saved && Array.isArray(saved.messages) && saved.messages.length) {
        state.messages = saved.messages.slice(-30);
        state.language = saved.language || "auto";
        state.notifiedFingerprint = saved.notifiedFingerprint || "";
        return;
      }
    } catch (error) {
      /* keep the default greeting */
    }
    state.messages = [{ role: "assistant", content: greeting("en") }];
  }

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        messages: state.messages.slice(-30),
        language: state.language,
        notifiedFingerprint: state.notifiedFingerprint,
      }));
    } catch (error) {
      /* session storage can be unavailable */
    }
  }

  function ensureStyles() {
    if (document.querySelector("link[data-rockfort-chat]")) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/css/chat.css";
    link.setAttribute("data-rockfort-chat", "1");
    document.head.appendChild(link);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function renderMessages() {
    var log = document.querySelector(".rf-log");
    if (!log) return;
    log.replaceChildren();
    state.messages.forEach(function (message) {
      log.appendChild(el("div", "rf-bubble " + (message.role === "user" ? "user" : "assistant"), message.content));
    });
    log.scrollTop = log.scrollHeight;
  }

  function setLanguage(language) {
    state.language = language;
    document.querySelectorAll(".rf-lang button").forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-lang") === language ? "true" : "false");
    });
    var hasUser = state.messages.some(function (message) { return message.role === "user"; });
    if (!hasUser) {
      state.messages = [{ role: "assistant", content: greeting(language === "ms" ? "ms" : "en") }];
      renderMessages();
    }
    saveState();
  }

  function openPanel() {
    var panel = document.getElementById("rf-panel");
    var launcher = document.querySelector(".rf-launcher");
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    var field = panel.querySelector("textarea");
    if (field) field.focus();
  }

  function closePanel() {
    var panel = document.getElementById("rf-panel");
    document.querySelector(".rf-launcher").setAttribute("aria-expanded", "false");
    panel.hidden = true;
  }

  function showError(text) {
    var log = document.querySelector(".rf-log");
    log.appendChild(el("div", "rf-bubble error", text));
    log.scrollTop = log.scrollHeight;
  }

  function waitForWidget() {
    return new Promise(function (resolve) {
      var started = Date.now();
      (function poll() {
        if ((state.sitekey && state.widgetId !== null) || Date.now() - started > 4000) resolve();
        else setTimeout(poll, 100);
      })();
    });
  }

  function token() {
    if (!state.sitekey || !window.turnstile || state.widgetId === null) return Promise.resolve("");
    return new Promise(function (resolve) {
      var settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value || "");
      }
      var timer = setTimeout(function () { finish(""); }, 15000);
      state.onToken = function (value) {
        clearTimeout(timer);
        finish(value);
      };
      try {
        window.turnstile.reset(state.widgetId);
        window.turnstile.execute(state.widgetId);
      } catch (error) {
        clearTimeout(timer);
        finish("");
      }
    });
  }

  function mountTurnstile(sitekey) {
    state.sitekey = sitekey || "";
    if (!state.sitekey) return;
    function render() {
      if (!window.turnstile) return;
      var slot = document.querySelector(".rf-turnstile");
      state.widgetId = window.turnstile.render(slot, {
        sitekey: state.sitekey,
        theme: "dark",
        appearance: "interaction-only",
        execution: "execute",
        callback: function (value) { if (state.onToken) state.onToken(value); },
        "error-callback": function () { if (state.onToken) state.onToken(""); },
      });
    }
    if (window.turnstile) {
      render();
      return;
    }
    var script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }

  async function sendMessage(text) {
    if (state.sending || !text) return;
    state.sending = true;
    var sendButton = document.querySelector(".rf-send");
    sendButton.disabled = true;
    state.messages.push({ role: "user", content: text });
    renderMessages();
    var log = document.querySelector(".rf-log");
    var typing = el("div", "rf-typing", "…");
    log.appendChild(typing);
    try {
      await waitForWidget();
      var turnstileToken = await token();
      var response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: state.messages,
          language: state.language,
          turnstileToken: turnstileToken,
          notifiedFingerprint: state.notifiedFingerprint,
          page: window.location.pathname,
        }),
      });
      var payload = await response.json();
      typing.remove();
      if (!response.ok) {
        state.messages.pop();
        renderMessages();
        showError(payload.error || "The front desk could not reply. Please email connect@rockfortindustries.com.");
        return;
      }
      state.messages.push({ role: "assistant", content: payload.reply });
      if (payload.notifiedFingerprint) state.notifiedFingerprint = payload.notifiedFingerprint;
      renderMessages();
      saveState();
    } catch (error) {
      typing.remove();
      state.messages.pop();
      renderMessages();
      showError("The front desk could not be reached. Please email connect@rockfortindustries.com.");
    } finally {
      state.sending = false;
      sendButton.disabled = false;
    }
  }

  function build() {
    ensureStyles();
    loadState();
    var root = el("div", "");
    root.id = "rf-front-desk";

    var launcher = el("button", "rf-launcher");
    launcher.type = "button";
    launcher.setAttribute("aria-label", "Open the Rockfort front desk chat");
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-controls", "rf-panel");
    launcher.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M5 4.5h14A2.5 2.5 0 0 1 21.5 7v8A2.5 2.5 0 0 1 19 17.5H9l-4.2 3.1a.8.8 0 0 1-1.3-.7V7A2.5 2.5 0 0 1 5 4.5Z"/></svg>';

    var panel = el("section", "rf-panel");
    panel.id = "rf-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Rockfort front desk");

    panel.innerHTML = [
      '<header class="rf-header">',
      '<img src="/images/logo.webp" alt="" width="48" height="27">',
      '<div class="rf-header-text"><h2>Rockfort front desk</h2><p>Questions and quotations</p></div>',
      '<button type="button" class="rf-icon-btn" data-close-chat aria-label="Close chat">&times;</button>',
      "</header>",
      '<div class="rf-lang" role="group" aria-label="Language">',
      '<button type="button" data-lang="en" aria-pressed="true">EN</button>',
      '<button type="button" data-lang="ms" aria-pressed="false">BM</button>',
      "</div>",
      '<div class="rf-log" aria-live="polite"></div>',
      '<div class="rf-turnstile"></div>',
      '<form class="rf-form">',
      '<textarea maxlength="1500" rows="1" placeholder="Describe the job" aria-label="Message"></textarea>',
      '<button type="submit" class="rf-send" aria-label="Send message">➤</button>',
      "</form>",
      '<p class="rf-privacy">Protected by <a href="https://www.cloudflare.com/turnstile-privacy-policy/" target="_blank" rel="noopener">Cloudflare Turnstile</a>.</p>',
    ].join("");

    root.appendChild(panel);
    root.appendChild(launcher);
    document.body.appendChild(root);
    renderMessages();
    setLanguage(state.language === "ms" ? "ms" : state.language === "en" ? "en" : "auto");

    launcher.addEventListener("click", function () {
      if (panel.hidden) openPanel();
      else closePanel();
    });
    panel.querySelector("[data-close-chat]").addEventListener("click", closePanel);
    panel.querySelectorAll(".rf-lang button").forEach(function (button) {
      button.addEventListener("click", function () { setLanguage(button.getAttribute("data-lang")); });
    });
    var form = panel.querySelector("form");
    var field = form.querySelector("textarea");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var text = field.value.trim();
      if (!text) return;
      field.value = "";
      sendMessage(text);
    });
    field.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !panel.hidden) closePanel();
    });
    document.addEventListener("click", function (event) {
      var trigger = event.target.closest && event.target.closest("[data-open-chat]");
      if (!trigger) return;
      event.preventDefault();
      openPanel();
    });

    fetch("/api/chat-config")
      .then(function (response) { return response.json(); })
      .then(function (payload) { mountTurnstile(payload.sitekey); })
      .catch(function () { /* chat still opens; send will explain if verification is required */ });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
