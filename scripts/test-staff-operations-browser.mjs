// Local browser acceptance against real Next routes and in-memory SQL.
// Auth HTTP and PostgREST transport are fixture adapters, not linked Supabase.
import { db } from "./staff-db-fixture.mjs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const uid = randomUUID(),
  field = randomUUID(),
  area = randomUUID();
for (const [id, role] of [
  [uid, "Platform Admin"],
  [field, "Field Vetting Agent"],
]) {
  await db.query("insert into auth.users(id)values($1)", [id]);
  await db.query(
    "insert into profiles(id,display_name,role,assigned_zone) values($1,'Synthetic Browser Staff',$2,'Edo')",
    [id, role],
  );
}
await db.query(
  "insert into neighborhoods(id,slug,name,city,state,active)values($1,'synthetic-browser','Synthetic browser area','Synthetic city','Edo',true)",
  [area],
);
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  let body = "";
  for await (const ch of req) body += ch;
  const url = new URL(req.url, "http://127.0.0.1:54329");
  let user = uid;
  try {
    user =
      JSON.parse(
        Buffer.from(
          (req.headers.authorization || "").split(".")[1] || "",
          "base64url",
        ),
      ).sub || uid;
  } catch {}
  try {
    if (url.pathname === "/auth/v1/user") {
      res.end(
        JSON.stringify({
          id: user,
          aud: "authenticated",
          role: "authenticated",
          email: "synthetic@example.invalid",
          app_metadata: {},
          user_metadata: {},
        }),
      );
      return;
    }
    const result = await db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: user, role: "authenticated" }),
      ]);
      if (url.pathname === "/rest/v1/rpc/update_staff_workspace_settings") {
        const p = JSON.parse(body);
        return tx.query(
          "select * from update_staff_workspace_settings($1,$2::smallint,$3::smallint,$4,$5::time,$6::time,$7::smallint)",
          [
            p.p_workspace_name,
            p.p_default_inspection_duration_mins,
            p.p_transit_buffer_mins,
            p.p_daylight_lock,
            p.p_daylight_start,
            p.p_daylight_end,
            p.p_retention_days,
          ],
        );
      }
      if (url.pathname === "/rest/v1/rpc/update_staff_coverage") {
        const p = JSON.parse(body);
        return tx.query("select * from update_staff_coverage($1,$2)", [
          p.p_neighborhood_id,
          p.p_active,
        ]);
      }
      if (url.pathname === "/rest/v1/profiles")
        return tx.query("select * from profiles where id=$1", [user]);
      if (url.pathname === "/rest/v1/workspace_settings")
        return tx.query("select * from workspace_settings where id=1");
      if (url.pathname === "/rest/v1/neighborhoods")
        return tx.query("select * from neighborhoods order by name");
      throw Error("UNSUPPORTED_FIXTURE_PATH " + url.pathname);
    });
    const object = req.headers.accept?.includes("vnd.pgrst.object");
    res.end(JSON.stringify(object ? result.rows[0] : result.rows));
  } catch (e) {
    res.statusCode = e.code === "42501" ? 403 : 500;
    res.end(JSON.stringify({ code: e.code || "fixture", message: e.message }));
  }
});
await new Promise((r) => server.listen(54329, "127.0.0.1", r));
const next = spawn(
  "node",
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3029",
  ],
  {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-synthetic-anon",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3029",
      NIA_N8N_ENABLED: "false",
      TELEGRAM_OUTBOUND_ENABLED: "false",
      TWILIO_OUTBOUND_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let serverLog = "";
next.stdout.on("data", (x) => {
  serverLog += x;
  console.log(String(x));
});
next.stderr.on("data", (x) => {
  serverLog += x;
  console.log(String(x));
});
let browser;
try {
  for (let i = 0; i < 45; i++) {
    try {
      const r = await fetch("http://127.0.0.1:3029/staff/signin", {
        signal: AbortSignal.timeout(30000),
      });
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  function token(id) {
    const a = Buffer.from(
        JSON.stringify({ alg: "HS256", typ: "JWT" }),
      ).toString("base64url"),
      b = Buffer.from(
        JSON.stringify({
          sub: id,
          role: "authenticated",
          aud: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString("base64url");
    return a + "." + b + ".synthetic";
  }
  async function context(id) {
    const c = await browser.newContext();
    await c.addInitScript(() => {
      const Native = window.AudioContext;
      if (Native)
        window.AudioContext = class extends Native {
          constructor(...args) {
            super(...args);
            window.__nestlyTestAudioContext = this;
          }
        };
    });
    const session = {
      access_token: token(id),
      refresh_token: "synthetic",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id, aud: "authenticated", role: "authenticated" },
    };
    await c.addCookies([
      {
        name: "sb-127-auth-token",
        value:
          "base64-" +
          Buffer.from(JSON.stringify(session)).toString("base64url"),
        url: "http://127.0.0.1:3029",
      },
    ]);
    await c.route("**/api/staff/activity", (r) =>
      r.fulfill({
        json: { attentionConversations: 0, unreadNotifications: 0 },
      }),
    );
    await c.route("https://**", (r) => r.abort());
    return c;
  }
  const c = await context(uid),
    p = await c.newPage();
  await p.goto("http://127.0.0.1:3029/staff/settings");
  console.log("URL", p.url());
  await p
    .getByRole("button", { name: "Save Changes" })
    .waitFor({ state: "visible", timeout: 25000 });
  await p.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent.includes("Save Changes"),
      )?.disabled,
  );
  await p.locator("#ws-name").fill("Synthetic Browser Updated");
  const saved = p.waitForResponse(
    (r) =>
      r.url().endsWith("/api/staff/workspace") &&
      r.request().method() === "PATCH",
  );
  await p.getByRole("button", { name: "Save Changes" }).click();
  assert.equal((await saved).status(), 200);
  await p.reload();
  await p.waitForFunction(
    () =>
      document.querySelector("#ws-name")?.value === "Synthetic Browser Updated",
  );
  assert.equal(
    (await db.query("select workspace_name from workspace_settings")).rows[0]
      .workspace_name,
    "Synthetic Browser Updated",
  );
  const audit = await db.transaction(async tx => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub:uid,role:'authenticated'})]);
    return tx.query("select count(*)::int n from audit_logs where action='workspace.settings.updated'");
  });
  assert.equal(audit.rows[0].n, 1);
  const toggle = p.getByLabel("Toggle Synthetic browser area");
  const coverageSaved = p.waitForResponse(
    (r) =>
      r.url().endsWith("/api/staff/workspace/coverage") &&
      r.request().method() === "PATCH",
  );
  await toggle.click();
  assert.equal((await coverageSaved).status(), 200);
  await p.waitForFunction(
    () =>
      !document.querySelector('[aria-label="Toggle Synthetic browser area"]')
        ?.checked,
  );
  assert.equal(
    (await db.query("select active from neighborhoods where id=$1", [area]))
      .rows[0].active,
    false,
  );
  await p.getByLabel("Enable in-app notification sound").check();
  await p.waitForFunction(
    () => localStorage.getItem("nestly.staff.notification-sound") === "enabled",
  );
  assert.equal(
    await p.evaluate(() => window.__nestlyTestAudioContext?.state),
    "running",
  );
  await p.reload();
  await p.waitForFunction(
    () =>
      document.querySelector('[aria-label="Enable in-app notification sound"]')
        ?.checked === true,
  );
  for (const width of [390, 1440]) {
    await p.setViewportSize({ width, height: 900 });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  }
  const fc = await context(field),
    fp = await fc.newPage();
  await fp.goto("http://127.0.0.1:3029/staff/settings");
  await fp
    .getByText("Workspace settings are read-only for your role.")
    .waitFor();
  assert.equal(
    await fp.getByRole("button", { name: "Save Changes" }).isDisabled(),
    true,
  );
  const denied = await fp.evaluate(async () => {
    const r = await fetch("/api/staff/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return r.status;
  });
  assert.equal(denied, 403);
  console.log(
    "PASS local Next.js settings save/reload, SQL audit, coverage toggle, AudioContext activation/preference (not audible playback), mobile/desktop overflow and field-role UI/API denial. Auth and REST transport are synthetic; no production services contacted.",
  );
} catch (e) {
  console.log(serverLog.slice(-2500));
  throw e;
} finally {
  if (browser) await browser.close();
  next.kill("SIGTERM");
  server.close();
  await db.close();
}
