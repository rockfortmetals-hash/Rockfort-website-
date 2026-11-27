# Front desk chat — setup before it can go live

The chat widget and `/api/chat` are in this repo. Merging to `main` lets Cloudflare Workers Builds deploy them to the existing **`rockfort-metals`** Worker. Do not rename that Worker. Do not deploy or change **`rockfort-metal-coating`** or **`rockfort-website`**. Do not change DNS. Titan email must keep receiving mail for `rockfortindustries.com`.

Nothing in this list belongs in git.

## 1. Private lead inbox

The address that receives quote emails is the secret `LEAD_EMAIL`. It is the private inbox named in the project brief. Do not write it into HTML, client JavaScript, `wrangler.jsonc`, or any file the site serves.

```bash
npx wrangler secret put LEAD_EMAIL
```

Paste the inbox when prompted. Wrangler does not put the value in the repo.

## 2. Sender address

`LEAD_FROM` is already set in `wrangler.jsonc` to `quotes@rockfortindustries.com`. That is the From address on the company domain, not the private inbox. Change it only if Email Sending is onboarded on a different address:

```bash
# optional, only if quotes@ should not be the sender
npx wrangler secret put LEAD_FROM
```

Replies are directed to the public address `connect@rockfortindustries.com`, which is already on the website.

## 3. Email Sending, without touching Titan

Use **Email Sending**. Do **not** enable **Email Routing** on `rockfortindustries.com`. Routing replaces the domain MX records and would stop Titan.

1. In the Cloudflare dashboard open **Compute → Email Service → Email Sending**.
2. Onboard `rockfortindustries.com` only if the wizard’s DNS preview does **not** delete or replace the existing Titan MX records. Email Sending should add records on the `cf-bounce` subdomain, plus SPF/DKIM (and DMARC if the zone does not already have them). If the preview wants to change the live MX, cancel.
3. Keep any existing SPF `include` for Titan and add Cloudflare’s include beside it, rather than replacing the record.
4. If the account is on the Workers Free plan, arbitrary recipients are blocked. Add the private inbox as a **verified destination address** (account level). A verification message is sent to that inbox. Do not click **Onboard domain** inside Email Routing.

The Worker sends with the `EMAIL` binding (`send_email` in `wrangler.jsonc`). No destination address is stored in the config, because that would commit the private inbox.

## 4. Workers AI

`wrangler.jsonc` binds Workers AI as `AI`. The model is `@cf/google/gemma-4-26b-a4b-it`. No extra secret is required for the binding. The scripted front desk answers from the published site text if the model errors, and it replaces any reply that invents a price.

`npm run dev` uses `wrangler.local.jsonc`, which omits the AI binding because Workers AI has no offline simulator. `.dev.vars` sets `ASSISTANT_MODE=scripted`, so the local demo uses the same published facts and lead rules. Do not set `ASSISTANT_MODE` on the production Worker. A logged-in `npx wrangler dev` against `wrangler.jsonc` calls Workers AI for questions and falls back to the scripted desk if the model fails.

## 5. Turnstile

1. Create a Turnstile widget (Managed or Invisible) for:
   - `rockfort-metals.rockfortmetals.workers.dev`
   - `rockfortindustries.com` when that host is live
   - `localhost` only if you want local checks against the real widget
2. Invisible mode needs the Turnstile privacy-policy link. The widget footer already has it.
3. Store the keys:

```bash
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put TURNSTILE_SITEKEY
```

`TURNSTILE_SITEKEY` is public by design (the browser has to see it). It is still set as a secret so the test keys are not committed. Optional:

```bash
npx wrangler secret put TURNSTILE_HOSTNAMES
```

Use a comma-separated list such as `rockfort-metals.rockfortmetals.workers.dev,rockfortindustries.com`. Do not include `localhost` in production.

Until `TURNSTILE_SECRET` is set, `/api/chat` refuses requests that are not from localhost.

## 6. Rate limit

`CHAT_RATE_LIMIT` allows 30 chat requests per minute per IP, per Cloudflare location. The namespace id is `482173`. Visitors also cannot send more than 30 messages, or more than 1,500 characters in one message.

## 7. What not to run

Do not `wrangler deploy` from a laptop unless you intend to publish `rockfort-metals`. Workers Builds does that from `main`. Preview builds of other branches fail today; that is an existing project setting.

## Local demo

`.dev.vars` is gitignored. For this checkout it points `LEAD_EMAIL` at `lead-inbox@example.test`, turns on `LEAD_SINK=capture`, and uses Turnstile’s always-pass test keys. A completed lead is kept in memory and shown only at `http://127.0.0.1:8787/api/dev/lead-preview`. That route does not exist on the public hostname.
