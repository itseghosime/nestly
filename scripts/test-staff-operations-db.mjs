/** Isolated PostgreSQL/WASM acceptance checks. Auth claim helpers and Storage metadata
 * are a local fixture, not Supabase Auth/Storage HTTP services. No network or live data. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "./staff-db-fixture.mjs";
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log("PASS", name);
}
async function as(role, uid, sql, args = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ role, ...(uid ? { sub: uid } : {}) }),
    ]);
    return tx.query(sql, args);
  });
}
async function denied(role, uid, sql, args = [], state = "42501") {
  await assert.rejects(as(role, uid, sql, args), (e) => e.code === state);
}
const admin = randomUUID(),
  ops = randomUUID(),
  field = randomUUID(),
  care = randomUUID();
for (const [id, role, zone] of [
  [admin, "Platform Admin", null],
  [ops, "Operations Lead", "Edo"],
  [field, "Field Vetting Agent", "Edo"],
  [care, "Customer Care", null],
]) {
  await db.query("insert into auth.users(id)values($1)", [id]);
  await db.query(
    "insert into profiles(id,display_name,role,assigned_zone)values($1,$2,$3,$4)",
    [id, "Synthetic SQL fixture", role, zone],
  );
}
const customer = randomUUID(),
  other = randomUUID();
await db.query(
  "insert into customers(id,whatsapp_phone,display_name)values($1,'sql-synthetic-a','Synthetic owner'),($2,'sql-synthetic-b','Synthetic second')",
  [customer, other],
);
const sub = randomUUID(),
  outSub = randomUUID(),
  enquiry = randomUUID();
const receipt = "ab".repeat(32);
for (const [id, state, r] of [
  [sub, "Edo", receipt],
  [outSub, "Delta", "cd".repeat(32)],
])
  await db.query(
    "insert into landlord_submissions(id,customer_id,idempotency_key,public_reference,receipt_hash,property_type,state,city,neighborhood,address,bedrooms,expected_annual_rent,description) values($1,$2,($1::uuid)::text,($1::uuid)::text,$3,'apartment',$4,'Synthetic city','Synthetic area','Synthetic address',2,2500000.75,'Synthetic record only')",
    [id, customer, r, state],
  );
await db.query(
  "insert into contact_enquiries(id,customer_id,message,idempotency_key,public_reference,receipt_hash) values($1,$2,'Synthetic enquiry',($1::uuid)::text,($1::uuid)::text,$3)",
  [enquiry, customer, "ef".repeat(32)],
);
const settingSql =
  "select * from update_staff_workspace_settings($1,75::smallint,45::smallint,true,'08:30'::time,'17:30'::time,730::smallint)";
await test("admin settings persist and audit atomically", async () => {
  const r = await as("authenticated", admin, settingSql, [
    "Synthetic workspace",
  ]);
  assert.equal(r.rows[0].workspace_name, "Synthetic workspace");
  assert.equal(r.rows[0].default_inspection_duration_mins, 75);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from audit_logs where action='workspace.settings.updated'",
      )
    ).rows[0].n,
    1,
  );
});
await test("same settings retry creates no duplicate audit", async () => {
  await as("authenticated", admin, settingSql, ["Synthetic workspace"]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from audit_logs where action='workspace.settings.updated'",
      )
    ).rows[0].n,
    1,
  );
});
for (const [id, label] of [
  [ops, "operations lead"],
  [field, "field agent"],
  [care, "customer care"],
])
  await test(label + " cannot change settings", () =>
    denied("authenticated", id, settingSql, ["Unauthorized"]),
  );
await test("anonymous cannot execute settings mutation", () =>
  denied("anon", null, settingSql, ["Unauthorized"]));
await test("invalid duration cannot be persisted", () =>
  denied(
    "authenticated",
    admin,
    "select * from update_staff_workspace_settings('bad',77::smallint,30::smallint,true,'09:00'::time,'17:00'::time,365::smallint)",
    [],
    "22023",
  ));
const revision = (
  await db.query(
    "select updated_at::text v from contact_enquiries where id=$1",
    [enquiry],
  )
).rows[0].v;
await test("lead update persists a matching audit", async () => {
  await as(
    "authenticated",
    admin,
    "select * from update_staff_lead_status('contact',$1,'in_review',$2::timestamptz)",
    [enquiry, revision],
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from audit_logs where action='contact_enquiry.status.updated'",
      )
    ).rows[0].n,
    1,
  );
});
await test("lead retry is a no-op even with original revision", async () => {
  await as(
    "authenticated",
    admin,
    "select * from update_staff_lead_status('contact',$1,'in_review',$2::timestamptz)",
    [enquiry, revision],
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from audit_logs where action='contact_enquiry.status.updated'",
      )
    ).rows[0].n,
    1,
  );
});
await test("stale different lead update is rejected", () =>
  denied(
    "authenticated",
    admin,
    "select * from update_staff_lead_status('contact',$1,'closed',$2::timestamptz)",
    [enquiry, revision],
    "40001",
  ));
await test("operations cannot update a general contact lead", () =>
  denied(
    "authenticated",
    ops,
    "select * from update_staff_lead_status('contact',$1,'closed',$2::timestamptz)",
    [enquiry, revision],
    "P0002",
  ));
await test("out of zone landlord conversion denied", () =>
  denied(
    "authenticated",
    ops,
    "select * from convert_landlord_submission_to_draft($1,'apartment')",
    [outSub],
    "P0002",
  ));
await test("customer care cannot convert a landlord lead", () =>
  denied(
    "authenticated",
    care,
    "select * from convert_landlord_submission_to_draft($1,'apartment')",
    [sub],
  ));
let media, draft;
await test("service reserves a private photo once", async () => {
  media = (
    await as(
      "service_role",
      null,
      "select * from reserve_landlord_submission_media($1,$2,'image/png',128)",
      [receipt, "12".repeat(32)],
    )
  ).rows[0];
  const again = (
    await as(
      "service_role",
      null,
      "select * from reserve_landlord_submission_media($1,$2,'image/png',128)",
      [receipt, "12".repeat(32)],
    )
  ).rows[0];
  assert.equal(media.id, again.id);
  assert.equal(media.bucket_id, "property-drafts");
});
await test("staff and anonymous cannot reserve receipt media directly", async () => {
  await denied(
    "authenticated",
    admin,
    "select * from reserve_landlord_submission_media($1,$2,'image/png',128)",
    [receipt, "34".repeat(32)],
  );
  await denied("anon", null, "select * from landlord_submission_media");
});
await test("wrong receipt cannot confirm another submission photo", () =>
  denied(
    "service_role",
    null,
    "select * from mark_landlord_submission_media_uploaded($1,$2)",
    ["cd".repeat(32), media.id],
    "P0002",
  ));
await test("uploaded media can be confirmed by its receipt", async () => {
  await as(
    "service_role",
    null,
    "select * from mark_landlord_submission_media_uploaded($1,$2)",
    [receipt, media.id],
  );
});
await test("conversion creates a private unverified draft preserving decimal rent", async () => {
  draft = (
    await as(
      "authenticated",
      admin,
      "select * from convert_landlord_submission_to_draft($1,'apartment')",
      [sub],
    )
  ).rows[0];
  assert.equal(draft.publication_state, "draft");
  assert.equal(draft.verification_state, "unverified");
  assert.equal(Number(draft.rent_annual), 2500000.75);
  assert.equal(draft.created, true);
});
await test("conversion retry does not duplicate draft evidence or audit", async () => {
  const again = (
    await as(
      "authenticated",
      admin,
      "select * from convert_landlord_submission_to_draft($1,'apartment')",
      [sub],
    )
  ).rows[0];
  assert.equal(again.property_id, draft.property_id);
  assert.equal(again.created, false);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from property_media where property_id=$1",
        [draft.property_id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from audit_logs where action='landlord_submission.property_draft_created'",
      )
    ).rows[0].n,
    1,
  );
});
await test("converted draft and evidence remain invisible to anonymous readers", async () => {
  assert.equal(
    (
      await as("anon", null, "select id from public_properties where id=$1", [
        draft.property_id,
      ])
    ).rows.length,
    0,
  );
  await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
    media.bucket_id,
    media.object_path,
  ]);
  assert.equal(
    (
      await as(
        "anon",
        null,
        "select id from storage.objects where bucket_id=$1 and name=$2",
        [media.bucket_id, media.object_path],
      )
    ).rows.length,
    0,
  );
});
await test("out of zone field agent cannot read the private draft", async () => {
  await db.query("update profiles set assigned_zone='Delta' where id=$1", [
    field,
  ]);
  assert.equal(
    (
      await as(
        "authenticated",
        field,
        "select id from properties where id=$1",
        [draft.property_id],
      )
    ).rows.length,
    0,
  );
});
const area = randomUUID();
await db.query(
  "insert into neighborhoods(id,slug,name,city,state,active)values($1,($1::uuid)::text,'Synthetic area','Synthetic city','Edo',true)",
  [area],
);
await test("coverage edit is audited and disables property coverage", async () => {
  await as(
    "authenticated",
    admin,
    "select * from update_staff_coverage($1,false)",
    [area],
  );
  assert.equal(
    (
      await as(
        "authenticated",
        admin,
        "select is_property_in_active_coverage($1) active",
        [draft.property_id],
      )
    ).rows[0].active,
    false,
  );
});
await test("field agent cannot change coverage", () =>
  denied(
    "authenticated",
    field,
    "select * from update_staff_coverage($1,true)",
    [area],
  ));
const conv = randomUUID();
await db.query(
  "insert into conversations(id,customer_id,channel,mode)values($1,$2,'website','AI_ACTIVE')",
  [conv, customer],
);
await db.query(
  "insert into messages(conversation_id,direction,sender_type,content,created_at) values($1,'inbound','customer','Old synthetic message',now()-interval '2 minutes'),($1,'outbound','nia','Latest synthetic message',now()-interval '1 minute')",
  [conv],
);
await test("inbox returns the newest message per authorized conversation", async () => {
  const r = await as(
    "authenticated",
    admin,
    "select * from get_staff_conversation_previews($1::uuid[])",
    [[conv]],
  );
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].content, "Latest synthetic message");
});
await test("anonymous cannot execute inbox previews", () =>
  denied(
    "anon",
    null,
    "select * from get_staff_conversation_previews($1::uuid[])",
    [[conv]],
  ));
await test("unrelated field agent cannot read private conversation preview", async () => {
  assert.equal(
    (
      await as(
        "authenticated",
        field,
        "select * from get_staff_conversation_previews($1::uuid[])",
        [[conv]],
      )
    ).rows.length,
    0,
  );
});
console.log(
  JSON.stringify({
    environment:
      "local PostgreSQL WASM with Auth and Storage metadata fixtures",
    migrations: 26,
    acceptancePassed: passed,
    externalRequests: 0,
  }),
);
await db.close();
