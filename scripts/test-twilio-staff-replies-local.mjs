import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const container = process.env.SUPABASE_TEST_DB_CONTAINER;
if (!container || !/^supabase_db_.*isolated.*$/i.test(container)) {
  throw new Error('Set SUPABASE_TEST_DB_CONTAINER to a running disposable Supabase DB container whose name includes "isolated"');
}

function docker(args) {
  try {
    return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Error('Disposable Supabase SQL command failed');
  }
}

if (docker(['inspect', '--format', '{{.State.Running}}', container]) !== 'true') {
  throw new Error('The selected disposable Supabase container is not running');
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function psql(sql) {
  try {
    return execFileSync('docker', [
      'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres',
      '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Error('Disposable Supabase SQL assertion failed');
  }
}

async function psqlAsync(sql) {
  try {
    const { stdout } = await execFileAsync('docker', [
      'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres',
      '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql,
    ], { encoding: 'utf8' });
    return stdout.trim();
  } catch {
    throw new Error('Concurrent disposable Supabase SQL assertion failed');
  }
}

function authenticatedSql(userId, sql) {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
  return `begin; set local role authenticated; set local request.jwt.claims = ${sqlLiteral(claims)}; ${sql}; commit;`;
}

function serviceSql(sql) {
  return `begin; set local role service_role; set local request.jwt.claims = '{"role":"service_role"}'; ${sql}; commit;`;
}

function expectSqlState(userId, state, statement) {
  const body = `
    do $test$
    declare caught boolean := false;
    begin
      begin
        ${statement};
      exception when sqlstate '${state}' then
        caught := true;
      end;
      if not caught then
        raise exception 'Expected SQLSTATE ${state}';
      end if;
    end
    $test$;
    select 'caught-${state}';
  `;
  assert.equal(psql(authenticatedSql(userId, body)), `caught-${state}`);
}

function expectServiceSqlState(state, statement) {
  const body = `
    do $test$
    declare caught boolean := false;
    begin
      begin
        ${statement};
      exception when sqlstate '${state}' then
        caught := true;
      end;
      if not caught then
        raise exception 'Expected SQLSTATE ${state}';
      end if;
    end
    $test$;
    select 'caught-${state}';
  `;
  assert.equal(psql(serviceSql(body)), `caught-${state}`);
}

function claimInvocation(conversationId, content, key) {
  return `perform 1 from public.claim_twilio_staff_reply(
      ${sqlLiteral(conversationId)}::uuid,
      ${sqlLiteral(content)},
      ${sqlLiteral(key)}
    )`;
}

function claimStatement(conversationId, content, key) {
  return `select message_id::text || '|' || should_dispatch::text || '|' || dispatch_status
    from public.claim_twilio_staff_reply(
      ${sqlLiteral(conversationId)}::uuid,
      ${sqlLiteral(content)},
      ${sqlLiteral(key)}
    )`;
}

function claim(userId, conversationId, content, key) {
  const [messageId, shouldDispatch, dispatchStatus] = psql(
    authenticatedSql(userId, claimStatement(conversationId, content, key)),
  ).split('|');
  assert.match(messageId, /^[0-9a-f-]{36}$/i);
  assert.ok(shouldDispatch === 'true' || shouldDispatch === 'false');
  return { messageId, shouldDispatch: shouldDispatch === 'true', dispatchStatus };
}

function serviceResult(sql) {
  const [messageId, dispatchStatus, deliveryStatus] = psql(serviceSql(sql)).split('|');
  assert.match(messageId, /^[0-9a-f-]{36}$/i);
  return { messageId, dispatchStatus, deliveryStatus };
}

function reconciliationServiceResult(sql) {
  const [messageId, dispatchStatus, deliveryStatus, disposition] = psql(serviceSql(sql)).split('|');
  assert.match(messageId, /^[0-9a-f-]{36}$/i);
  return { messageId, dispatchStatus, deliveryStatus, disposition };
}

const migrationReady = psql(
  "select (to_regprocedure('public.claim_twilio_staff_reply(uuid,text,text)') is not null)::text || '|' || " +
  "(to_regprocedure('public.finish_twilio_staff_reply(uuid,text,text,text,text)') is not null)::text || '|' || " +
  "(to_regprocedure('public.apply_twilio_message_status(uuid,text,text,text)') is not null)::text || '|' || " +
  "(exists (select 1 from supabase_migrations.schema_migrations where version='20261019101500'))::text || '|' || " +
  "(exists (select 1 from supabase_migrations.schema_migrations where version='20261019103000'))::text || '|' || " +
  "(exists (select 1 from supabase_migrations.schema_migrations where version='20261019104000'))::text || '|' || " +
  "(to_regprocedure('public.guard_twilio_pending_assignment_change()') is not null)::text || '|' || " +
  "(exists (select 1 from supabase_migrations.schema_migrations where version='20261019105000'))::text || '|' || " +
  "(to_regprocedure('public.guard_twilio_status_event_message()') is not null)::text || '|' || " +
  "(exists (select 1 from supabase_migrations.schema_migrations where version='20261019110000'))::text || '|' || " +
  "has_table_privilege('service_role', 'public.twilio_message_status_events', 'SELECT')::text || '|' || " +
  "(to_regprocedure('public.record_twilio_reconciliation_attempt(uuid,uuid,text,text,text)') is not null)::text || '|' || " +
  "(to_regprocedure('public.reconcile_twilio_staff_reply(uuid,uuid,text,text,timestamptz,text)') is not null)::text || '|' || " +
  "(exists (select 1 from supabase_migrations.schema_migrations where version='20261019111000'))::text || '|' || " +
  "has_function_privilege('authenticated', 'public.reconcile_twilio_staff_reply(uuid,uuid,text,text,timestamp with time zone,text)', 'EXECUTE')::text;",
);
assert.equal(
  migrationReady,
  'true|true|true|true|true|true|true|true|true|true|false|true|true|true|false',
  'Apply the Twilio reply and operator reconciliation migrations to the disposable stack first',
);

const [platformAdmin1, platformAdmin2] = psql(
  "select id::text from public.profiles where role='Platform Admin' order by id limit 2;",
).split('\n');
assert.match(platformAdmin1 || '', /^[0-9a-f-]{36}$/i, 'A synthetic local Platform Admin profile is required');
assert.match(platformAdmin2 || '', /^[0-9a-f-]{36}$/i, 'Two local Platform Admin profiles are required for takeover-race testing');

const restrictedStaff = psql(
  "select id::text from public.profiles where role='Legal & Compliance' order by id limit 1;",
) || randomUUID();
const anonymousUser = randomUUID();
const customerPhone = `+1555${randomInt(10_000_000, 99_999_999)}`;
const customerName = `SYNTHETIC - Twilio Staff Reply ${randomUUID()}`;
const customerId = psql(
  `insert into public.customers (whatsapp_phone, full_name, display_name) values (` +
  `${sqlLiteral(customerPhone)}, ${sqlLiteral(customerName)}, ${sqlLiteral(customerName)}) returning id::text;`,
);
const conversationId = psql(
  `insert into public.conversations (customer_id, channel, mode) values (` +
  `${sqlLiteral(customerId)}::uuid, 'whatsapp', 'AI_ACTIVE') returning id::text;`,
);
const inboundSid = `SM${randomUUID().replaceAll('-', '').toUpperCase()}`;
psql(
  `insert into public.messages (conversation_id, provider_message_id, direction, sender_type, content, delivery_status) values (` +
  `${sqlLiteral(conversationId)}::uuid, ${sqlLiteral(inboundSid)}, 'inbound', 'customer', ` +
  `'Synthetic inbound fixture; no provider request', 'received');`,
);

expectSqlState(anonymousUser, '42501', claimInvocation(
  conversationId, 'Synthetic unauthorized reply', `synthetic-unauthorized-${randomUUID()}`,
));
expectSqlState(platformAdmin1, '22023', claimInvocation(
  conversationId, 'Synthetic reply before takeover', `synthetic-before-takeover-${randomUUID()}`,
));

const takeOver = (userId) => authenticatedSql(
  userId,
  `with changed as (
     update public.conversations
     set mode='HUMAN_ACTIVE', assigned_staff_id=${sqlLiteral(userId)}::uuid
     where id=${sqlLiteral(conversationId)}::uuid
     returning id
   )
   select count(*)::text from changed`,
);
const takeoverResults = await Promise.all([
  psqlAsync(takeOver(platformAdmin1)),
  psqlAsync(takeOver(platformAdmin2)),
]);
assert.deepEqual(takeoverResults, ['1', '1'], 'Both competing authorized takeovers should be serialized successfully');

const currentAssignee = psql(
  `select assigned_staff_id::text from public.conversations where id=${sqlLiteral(conversationId)}::uuid;`,
);
assert.ok(
  currentAssignee === platformAdmin1 || currentAssignee === platformAdmin2,
  'The final assignee must be one of the two competing authorized staff members',
);
const otherAdmin = currentAssignee === platformAdmin1 ? platformAdmin2 : platformAdmin1;

expectSqlState(otherAdmin, '42501', claimInvocation(
  conversationId, 'Synthetic reply from non-assignee', `synthetic-non-assignee-${randomUUID()}`,
));
expectSqlState(restrictedStaff, '42501', claimInvocation(
  conversationId, 'Synthetic reply from restricted staff role', `synthetic-restricted-${randomUUID()}`,
));

const niaSuppression = `
  do $test$
  declare caught boolean := false;
  begin
    begin
      insert into public.messages (
        conversation_id, provider_message_id, direction, sender_type, content, delivery_status
      ) values (
        ${sqlLiteral(conversationId)}::uuid,
        ${sqlLiteral(`nia:${randomUUID()}`)},
        'outbound', 'nia', 'Synthetic Nia reply must be suppressed', 'queued'
      );
    exception when sqlstate '42501' then
      caught := true;
    end;
    if not caught then
      raise exception 'Nia message was not suppressed during staff takeover';
    end if;
  end
  $test$;
  select 'suppressed';
`;
assert.equal(psql(niaSuppression), 'suppressed');

const sharedKey = `synthetic-race-${randomUUID()}`;
const sharedContent = 'Synthetic concurrent staff reply';
const concurrentClaims = await Promise.all([
  psqlAsync(authenticatedSql(currentAssignee, claimStatement(conversationId, sharedContent, sharedKey))),
  psqlAsync(authenticatedSql(currentAssignee, claimStatement(conversationId, sharedContent, sharedKey))),
]);
const concurrentRows = concurrentClaims.map((value) => {
  const [messageId, shouldDispatch, dispatchStatus] = value.split('|');
  assert.match(messageId, /^[0-9a-f-]{36}$/i);
  return { messageId, shouldDispatch, dispatchStatus };
});
assert.equal(new Set(concurrentRows.map((row) => row.messageId)).size, 1, 'Concurrent duplicates must return one message');
assert.equal(concurrentRows.filter((row) => row.shouldDispatch === 'true').length, 1, 'Exactly one duplicate request may dispatch');
assert.equal(concurrentRows.filter((row) => row.shouldDispatch === 'false').length, 1);
const firstMessageId = concurrentRows[0].messageId;

expectSqlState(
  otherAdmin,
  '55000',
  `update public.conversations set mode='AI_ACTIVE', assigned_staff_id=null where id=${sqlLiteral(conversationId)}::uuid`,
);
expectSqlState(currentAssignee, '55000', claimInvocation(
  conversationId, 'Synthetic second send while first is uncertain', `synthetic-overlap-${randomUUID()}`,
));

const firstProviderSid = `SM${randomUUID().replaceAll('-', '').toUpperCase()}`;
const firstAccepted = serviceResult(
  `select message_id::text || '|' || dispatch_status || '|' || delivery_status from ` +
  `public.finish_twilio_staff_reply(${sqlLiteral(firstMessageId)}::uuid, 'accepted', ` +
  `${sqlLiteral(firstProviderSid)}, 'queued', null)`,
);
assert.deepEqual(firstAccepted, {
  messageId: firstMessageId,
  dispatchStatus: 'accepted',
  deliveryStatus: 'queued',
});

function nextClaim(label) {
  return claim(
    currentAssignee,
    conversationId,
    `Synthetic ${label}`,
    `synthetic-${label.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}`,
  );
}

function applyStatus(messageId, providerSid, status, errorCode = null) {
  return serviceResult(
    `select message_id::text || '|' || dispatch_status || '|' || delivery_status from ` +
    `public.apply_twilio_message_status(${sqlLiteral(messageId)}::uuid, ${sqlLiteral(providerSid)}, ` +
    `${sqlLiteral(status)}, ${errorCode === null ? 'null' : sqlLiteral(errorCode)})`,
  );
}

const orderedMessage = nextClaim('callback ordering');
assert.equal(orderedMessage.shouldDispatch, true);
const orderedSid = `SM${randomUUID().replaceAll('-', '').toUpperCase()}`;
assert.equal(applyStatus(orderedMessage.messageId, orderedSid, 'sent').deliveryStatus, 'sent');
assert.equal(applyStatus(orderedMessage.messageId, orderedSid, 'delivered').deliveryStatus, 'delivered');
assert.equal(applyStatus(orderedMessage.messageId, orderedSid, 'queued').deliveryStatus, 'delivered');
assert.equal(applyStatus(orderedMessage.messageId, orderedSid, 'read').deliveryStatus, 'read');
assert.equal(applyStatus(orderedMessage.messageId, orderedSid, 'sent').deliveryStatus, 'read');
expectServiceSqlState(
  '23505',
  `perform 1 from public.apply_twilio_message_status(` +
  `${sqlLiteral(orderedMessage.messageId)}::uuid, ${sqlLiteral(`SM${randomUUID().replaceAll('-', '').toUpperCase()}`)}, 'delivered', null)`,
);
assert.equal(
  psql(`select count(*)::text from public.twilio_message_status_events where message_id=${sqlLiteral(orderedMessage.messageId)}::uuid;`),
  '4',
  'Repeated status callbacks must be deduplicated by provider SID and status',
);

const failedMessage = nextClaim('failure ordering');
assert.equal(failedMessage.shouldDispatch, true);
const failedSid = `SM${randomUUID().replaceAll('-', '').toUpperCase()}`;
expectServiceSqlState(
  '23505',
  `perform 1 from public.apply_twilio_message_status(` +
  `${sqlLiteral(failedMessage.messageId)}::uuid, ${sqlLiteral(orderedSid)}, 'sent', null)`,
);
assert.equal(applyStatus(failedMessage.messageId, failedSid, 'failed', '30003').deliveryStatus, 'failed');
assert.equal(applyStatus(failedMessage.messageId, failedSid, 'delivered').deliveryStatus, 'failed');
expectServiceSqlState(
  '23505',
  `perform 1 from public.apply_twilio_message_status(` +
  `${sqlLiteral(failedMessage.messageId)}::uuid, ${sqlLiteral(`SM${randomUUID().replaceAll('-', '').toUpperCase()}`)}, 'delivered', null)`,
);

const rejectedMessage = nextClaim('provider rejection');
const rejectedRow = serviceResult(
  `select message_id::text || '|' || dispatch_status || '|' || delivery_status from ` +
  `public.finish_twilio_staff_reply(${sqlLiteral(rejectedMessage.messageId)}::uuid, 'rejected', null, null, '21610')`,
);
assert.equal(rejectedRow.dispatchStatus, 'failed');
assert.equal(rejectedRow.deliveryStatus, 'failed');
const uncertainMessage = nextClaim('uncertain send');
const uncertainRow = serviceResult(
  `select message_id::text || '|' || dispatch_status || '|' || delivery_status from ` +
  `public.finish_twilio_staff_reply(${sqlLiteral(uncertainMessage.messageId)}::uuid, 'unknown', null, null, null)`,
);
assert.equal(uncertainRow.dispatchStatus, 'unknown');
expectSqlState(currentAssignee, '55000', claimInvocation(
  conversationId, 'Synthetic new message blocked by unknown send', `synthetic-after-unknown-${randomUUID()}`,
));
const recoveredSid = `SM${randomUUID().replaceAll('-', '').toUpperCase()}`;
assert.equal(applyStatus(uncertainMessage.messageId, recoveredSid, 'queued').dispatchStatus, 'accepted');
const staleMessage = nextClaim('after callback reconciliation');
assert.equal(staleMessage.shouldDispatch, true);
assert.equal(serviceResult(
  `select message_id::text || '|' || dispatch_status || '|' || delivery_status from ` +
  `public.finish_twilio_staff_reply(${sqlLiteral(staleMessage.messageId)}::uuid, 'unknown', null, null, null)`,
).dispatchStatus, 'unknown');
psql(
  `update public.messages set dispatch_updated_at=now()-interval '16 minutes' ` +
  `where id=${sqlLiteral(staleMessage.messageId)}::uuid;`,
);
const reconciliationSid = `SM${randomUUID().replaceAll('-', '').toUpperCase()}`;
assert.deepEqual(reconciliationServiceResult(
  `select message_id::text || '|' || dispatch_status || '|' || delivery_status || '|' || disposition from ` +
  `public.reconcile_twilio_staff_reply(` +
  `${sqlLiteral(currentAssignee)}::uuid, ${sqlLiteral(staleMessage.messageId)}::uuid, ` +
  `${sqlLiteral(reconciliationSid)}, 'delivered', ` +
  `(select created_at from public.messages where id=${sqlLiteral(staleMessage.messageId)}::uuid), null)`,
), {
  messageId: staleMessage.messageId,
  dispatchStatus: 'accepted',
  deliveryStatus: 'delivered',
  disposition: 'reconciled',
});
assert.equal(
  psql(
    `select count(*)::text from public.audit_logs ` +
    `where actor_id=${sqlLiteral(currentAssignee)}::uuid ` +
    `and entity_id=${sqlLiteral(staleMessage.messageId)}::uuid ` +
    `and action='twilio.dispatch.reconciled' ` +
    `and metadata->>'provider_status'='delivered' ` +
    `and metadata->>'evidence_source'='twilio_message_resource';`,
  ),
  '1',
  'A provider-evidence reconciliation must be recorded in the staff audit log',
);
expectSqlState(
  currentAssignee,
  '42501',
  `perform 1 from public.reconcile_twilio_staff_reply(` +
  `${sqlLiteral(currentAssignee)}::uuid, ${sqlLiteral(staleMessage.messageId)}::uuid, ` +
  `${sqlLiteral(reconciliationSid)}, 'read', ` +
  `(select created_at from public.messages where id=${sqlLiteral(staleMessage.messageId)}::uuid), null)`,
);
expectServiceSqlState(
  '42501',
  `perform 1 from public.reconcile_twilio_staff_reply(` +
  `${sqlLiteral(restrictedStaff)}::uuid, ${sqlLiteral(staleMessage.messageId)}::uuid, ` +
  `${sqlLiteral(reconciliationSid)}, 'read', ` +
  `(select created_at from public.messages where id=${sqlLiteral(staleMessage.messageId)}::uuid), null)`,
);

const freshMessage = nextClaim('fresh operator reconciliation');
serviceResult(
  `select message_id::text || '|' || dispatch_status || '|' || delivery_status from ` +
  `public.finish_twilio_staff_reply(${sqlLiteral(freshMessage.messageId)}::uuid, 'unknown', null, null, null)`,
);
const freshProviderSid = `SM${randomUUID().replaceAll('-', '').toUpperCase()}`;
expectServiceSqlState(
  '55000',
  `perform 1 from public.reconcile_twilio_staff_reply(` +
  `${sqlLiteral(currentAssignee)}::uuid, ${sqlLiteral(freshMessage.messageId)}::uuid, ` +
  `${sqlLiteral(freshProviderSid)}, 'delivered', ` +
  `(select created_at from public.messages where id=${sqlLiteral(freshMessage.messageId)}::uuid), null)`,
);

const anonymousVisibility = psql(`
  begin;
  set local role anon;
  set local request.jwt.claims = '{"role":"anon"}';
  do $test$
  declare visible_rows bigint := 0;
  begin
    if has_table_privilege('anon', 'public.messages', 'SELECT') then
      execute ${sqlLiteral(`select count(*) from public.messages where conversation_id = '${conversationId}'::uuid`)}
        into visible_rows;
    end if;
    if visible_rows <> 0 then
      raise exception 'Anonymous role can see synthetic WhatsApp messages';
    end if;
  end
  $test$;
  select 'isolated';
  rollback;
`);
assert.equal(anonymousVisibility, 'isolated', 'Anonymous customer access must not reveal staff WhatsApp messages');

console.log('Disposable Supabase Twilio reply tests passed: takeover race, assigned-staff authorization, concurrent idempotent claims, unresolved-send blocking, Nia suppression, callback dedup/order, rejection, evidence-based reconciliation, stale-window enforcement, audit logging, service-only authorization, and anonymous isolation. Synthetic fixtures were retained; no existing records were deleted.');
