import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const container = process.env.SUPABASE_TEST_DB_CONTAINER;
if (!container || !/^supabase_db_.*isolated.*$/i.test(container)) {
  throw new Error('Set SUPABASE_TEST_DB_CONTAINER to a running disposable Supabase DB container whose name includes "isolated"');
}

function docker(args, input) {
  try {
    return execFileSync('docker', args, {
      encoding: 'utf8',
      input,
    }).trim();
  } catch (error) {
    const detail = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8').trim() : '';
    throw new Error(`Disposable Supabase SQL assertion failed${detail ? `: ${detail}` : ''}`);
  }
}

if (docker(['inspect', '--format', '{{.State.Running}}', container]) !== 'true') {
  throw new Error('The selected disposable Supabase container is not running');
}

function psql(sql) {
  return docker([
    'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql,
  ]);
}

async function psqlAsync(sql) {
  try {
    const { stdout } = await execFileAsync('docker', [
      'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres',
      '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql,
    ], { encoding: 'utf8', input: sql });
    return stdout.trim();
  } catch (error) {
    const detail = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8').trim() : '';
    throw new Error(`Concurrent disposable Supabase SQL assertion failed${detail ? `: ${detail}` : ''}`);
  }
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function serviceSql(sql) {
  return `begin; set local role service_role; set local request.jwt.claims = '{"role":"service_role"}'; ${sql}; commit;`;
}

function authenticatedSql(userId, sql) {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
  return `begin; set local role authenticated; set local request.jwt.claims = ${sqlLiteral(claims)}; ${sql}; commit;`;
}

function anonymousSql(sql) {
  return `begin; set local role anon; set local request.jwt.claims = '{"role":"anon"}'; ${sql}; commit;`;
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
      if not caught then raise exception 'Expected SQLSTATE ${state}'; end if;
    end
    $test$;
    select 'caught-${state}';
  `;
  assert.equal(psql(serviceSql(body)), `caught-${state}`);
}

function expectAuthenticatedSqlState(userId, state, statement) {
  const body = `
    do $test$
    declare caught boolean := false;
    begin
      begin
        ${statement};
      exception when sqlstate '${state}' then
        caught := true;
      end;
      if not caught then raise exception 'Expected SQLSTATE ${state}'; end if;
    end
    $test$;
    select 'caught-${state}';
  `;
  assert.equal(psql(authenticatedSql(userId, body)), `caught-${state}`);
}

const migration = readFileSync(
  new URL('../supabase/migrations/20261019120000_nestly_telegram_channel.sql', import.meta.url),
  'utf8',
);

function applyMigrationFunction(startMarker, endMarker) {
  const start = migration.indexOf(startMarker);
  const end = migration.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('Telegram migration test setup could not locate function definitions');
  psql(migration.slice(start, end));
}

const schemaReady = psql(
  "select (to_regclass('public.telegram_identities') is not null)::text || '|' || " +
  "(to_regclass('public.telegram_updates') is not null)::text || '|' || " +
  "(to_regclass('public.telegram_message_dispatches') is not null)::text || '|' || " +
  "(to_regprocedure('public.claim_telegram_update(bigint,bigint,bigint,bigint)') is not null)::text || '|' || " +
  "(to_regprocedure('public.persist_telegram_inbound(bigint,bigint,bigint,bigint,text,text,text)') is not null)::text || '|' || " +
  "(to_regprocedure('public.claim_telegram_ai_reply(bigint,bigint,text,jsonb)') is not null)::text || '|' || " +
  "(to_regprocedure('public.claim_telegram_staff_reply(uuid,text,text)') is not null)::text || '|' || " +
  "(to_regprocedure('public.finish_telegram_dispatch(uuid,text,bigint,text)') is not null)::text;",
);
assert.equal(schemaReady, 'true|true|true|true|true|true|true|true', 'Apply the Telegram migration to the disposable local database first');

applyMigrationFunction(
  'create or replace function public.nestly_handoff_notifications()',
  'create or replace function public.can_access_conversation(',
);
applyMigrationFunction(
  'create or replace function public.can_access_conversation(',
  'create or replace function public.claim_telegram_update(',
);
applyMigrationFunction(
  'create or replace function public.guard_telegram_pending_assignment_change()',
  'drop trigger if exists nestly_telegram_pending_assignment_guard',
);
applyMigrationFunction(
  'create or replace function public.claim_telegram_update(',
  'create or replace function public.complete_telegram_update(',
);
applyMigrationFunction(
  'create or replace function public.persist_telegram_inbound(',
  'create or replace function public.claim_telegram_handoff_reply(',
);
applyMigrationFunction(
  'create or replace function public.claim_telegram_handoff_reply(',
  'create or replace function public.claim_telegram_ai_reply(',
);
applyMigrationFunction(
  'create or replace function public.claim_telegram_ai_reply(',
  'create or replace function public.claim_telegram_staff_reply(',
);

const privileges = psql(
  "select has_table_privilege('anon', 'public.telegram_identities', 'SELECT')::text || '|' || " +
  "has_table_privilege('authenticated', 'public.telegram_identities', 'SELECT')::text || '|' || " +
  "has_table_privilege('service_role', 'public.telegram_updates', 'SELECT')::text || '|' || " +
  "has_function_privilege('anon', 'public.claim_telegram_update(bigint,bigint,bigint,bigint)', 'EXECUTE')::text || '|' || " +
  "has_function_privilege('service_role', 'public.claim_telegram_update(bigint,bigint,bigint,bigint)', 'EXECUTE')::text;",
);
assert.equal(privileges, 'false|true|false|false|true', 'Telegram identities and processing ledgers must remain private');

const [staffId, otherStaffId] = psql(
  "select id::text from public.profiles where role='Platform Admin' order by id limit 2;",
).split('\n');
assert.match(staffId || '', /^[0-9a-f-]{36}$/i, 'Two synthetic local Platform Admin profiles are required');
assert.match(otherStaffId || '', /^[0-9a-f-]{36}$/i, 'Two synthetic local Platform Admin profiles are required');
const restrictedStaffId = psql(
  "select id::text from public.profiles where role='Legal & Compliance' order by id limit 1;",
) || randomUUID();

const websiteCustomerId = psql(
  `insert into public.customers (full_name, display_name, email, phone, whatsapp_phone) ` +
  `values ('SYNTHETIC Website Handoff', 'SYNTHETIC Website Handoff', null, null, null) returning id::text;`,
);
const websiteConversationId = psql(
  `insert into public.conversations (customer_id, mode, channel) ` +
  `values (${sqlLiteral(websiteCustomerId)}::uuid, 'AI_ACTIVE', 'website') returning id::text;`,
);
const websiteTokenHash = randomUUID().replaceAll('-', '').repeat(2);
const websiteHandoffKey = `synthetic-website-handoff-${randomUUID()}`;
psql(
  `insert into public.website_conversation_tokens (conversation_id, token_hash, idempotency_key, expires_at) ` +
  `values (${sqlLiteral(websiteConversationId)}::uuid, ${sqlLiteral(websiteTokenHash)}, ` +
  `${sqlLiteral(websiteHandoffKey)}, now() + interval '1 hour');`,
);
const websiteHandoff = psql(anonymousSql(
  `select conversation_id::text || '|' || mode from public.request_website_handoff(` +
  `${sqlLiteral(websiteTokenHash)}, ${sqlLiteral(websiteHandoffKey)})`,
));
assert.equal(websiteHandoff, `${websiteConversationId}|HUMAN_ACTIVE`,
  'The existing transaction-local website handoff setting must remain authorized');
const websiteStaffReply = psql(authenticatedSql(
  staffId,
  `select message_id::text from public.send_website_staff_reply(` +
  `${sqlLiteral(websiteConversationId)}::uuid, 'Synthetic staff reply to website handoff', ` +
  `${sqlLiteral(`synthetic-website-staff-${randomUUID()}`)})`,
));
assert.match(websiteStaffReply, /^[0-9a-f-]{36}$/i,
  'Staff must retain the existing website handoff reply path');

const botId = 987654321;
const syntheticUserBase = 4_000_000_000_000
  + Number(BigInt(`0x${randomUUID().replaceAll('-', '').slice(0, 8)}`));

function newUpdateId() {
  return Number(BigInt(`0x${randomUUID().replaceAll('-', '').slice(0, 12)}`));
}

expectServiceSqlState(
  '22023',
  `perform 1 from public.claim_telegram_update(${botId}, ${newUpdateId()}, 0, 0)`,
);

function claimUpdateSql(updateId, userId, chatId) {
  return `select should_process::text || '|' || state from public.claim_telegram_update(
    ${botId}, ${updateId}, ${userId === null ? 'null' : userId}, ${chatId === null ? 'null' : chatId}
  )`;
}

function persistInbound(updateId, userId, text, username = 'shared_synthetic_handle') {
  const displayName = `SYNTHETIC Telegram ${userId}`;
  const output = psql(serviceSql(
    `select conversation_id::text || '|' || mode || '|' || message_id::text ` +
    `from public.persist_telegram_inbound(${botId}, ${updateId}, ${userId}, ${userId}, ` +
    `${sqlLiteral(displayName)}, ${sqlLiteral(username)}, ${sqlLiteral(text)})`,
  ));
  const [conversationId, mode, messageId] = output.split('|');
  assert.match(conversationId || '', /^[0-9a-f-]{36}$/i);
  assert.match(messageId || '', /^[0-9a-f-]{36}$/i);
  return { conversationId, mode, messageId };
}

function telegramDispatchClaim(sql) {
  const output = psql(sql);
  if (!output) return null;
  const [messageId, chatId, shouldDispatch, status] = output.split('|');
  assert.match(messageId || '', /^[0-9a-f-]{36}$/i);
  return { messageId, chatId, shouldDispatch: shouldDispatch === 'true', status };
}

function finishDispatch(messageId, outcome, telegramMessageId = null, errorCode = null) {
  const output = psql(serviceSql(
    `select message_id::text || '|' || dispatch_status || '|' || delivery_status ` +
    `from public.finish_telegram_dispatch(${sqlLiteral(messageId)}::uuid, ${sqlLiteral(outcome)}, ` +
    `${telegramMessageId === null ? 'null' : telegramMessageId}, ` +
    `${errorCode === null ? 'null' : sqlLiteral(errorCode)})`,
  ));
  const [returnedId, dispatchStatus, deliveryStatus] = output.split('|');
  assert.equal(returnedId, messageId);
  return { dispatchStatus, deliveryStatus };
}

const duplicateUpdateId = newUpdateId();
const concurrentClaims = await Promise.all([
  psqlAsync(serviceSql(claimUpdateSql(duplicateUpdateId, syntheticUserBase + 1, syntheticUserBase + 1))),
  psqlAsync(serviceSql(claimUpdateSql(duplicateUpdateId, syntheticUserBase + 1, syntheticUserBase + 1))),
]);
assert.deepEqual(
  concurrentClaims.map((row) => row.split('|')[0]).sort(),
  ['false', 'true'],
  'Concurrent duplicate updates must have exactly one processor',
);
const concurrentInbound = persistInbound(duplicateUpdateId, syntheticUserBase + 1, 'Synthetic duplicate update');
assert.equal(
  persistInbound(duplicateUpdateId, syntheticUserBase + 1, 'Synthetic duplicate update').messageId,
  concurrentInbound.messageId,
  'Retrying persistence for one Telegram update must reuse its inbound message',
);
assert.equal(
  psql(`select count(*)::text from public.messages where idempotency_key=${sqlLiteral(`telegram:${botId}:${duplicateUpdateId}`)};`),
  '1',
  'A replayed update must persist one inbound message',
);
psql(serviceSql(
  `select public.complete_telegram_update(${botId}, ${duplicateUpdateId}, 'ignored', 'TEST_COMPLETE')`,
));

const firstIdentityUpdate = newUpdateId();
psql(serviceSql(claimUpdateSql(firstIdentityUpdate, syntheticUserBase + 2, syntheticUserBase + 2)));
const firstIdentity = persistInbound(firstIdentityUpdate, syntheticUserBase + 2, 'Synthetic identity one');
const secondIdentityUpdate = newUpdateId();
psql(serviceSql(claimUpdateSql(secondIdentityUpdate, syntheticUserBase + 3, syntheticUserBase + 3)));
const secondIdentity = persistInbound(secondIdentityUpdate, syntheticUserBase + 3, 'Synthetic identity two');
assert.notEqual(firstIdentity.conversationId, secondIdentity.conversationId);
assert.equal(
  psql(
    `select count(distinct customer_id)::text from public.telegram_identities ` +
    `where bot_id=${botId} and username='shared_synthetic_handle' and telegram_user_id in (${syntheticUserBase + 2},${syntheticUserBase + 3});`,
  ),
  '2',
  'Display names and usernames must not merge Telegram identities',
);

const handoffUpdateId = newUpdateId();
psql(serviceSql(claimUpdateSql(handoffUpdateId, syntheticUserBase + 4, syntheticUserBase + 4)));
const handoffInbound = persistInbound(handoffUpdateId, syntheticUserBase + 4, 'Synthetic request for a human');
const handoffClaim = telegramDispatchClaim(serviceSql(
  `select message_id::text || '|' || chat_id::text || '|' || should_dispatch::text || '|' || dispatch_status ` +
  `from public.claim_telegram_handoff_reply(${botId}, ${handoffUpdateId}, 'Synthetic handoff request')`,
));
assert.ok(handoffClaim?.shouldDispatch);
assert.equal(psql(
  `select mode from public.conversations where id=${sqlLiteral(handoffInbound.conversationId)}::uuid;`,
), 'HUMAN_ACTIVE');
assert.ok(Number(psql(
  `select count(*)::text from public.notifications where conversation_id=${sqlLiteral(handoffInbound.conversationId)}::uuid ` +
  `and template_key='human_handoff_requested' and channel='dashboard';`,
)) > 0);
assert.ok(Number(psql(
  `select count(*)::text from public.audit_logs where entity_id=${sqlLiteral(handoffInbound.conversationId)}::uuid ` +
  `and action='conversation.mode_changed';`,
)) > 0);
assert.deepEqual(finishDispatch(handoffClaim.messageId, 'rejected', null, 'OUTBOUND_DISABLED'), {
  dispatchStatus: 'failed',
  deliveryStatus: 'failed',
});

const humanUpdateId = newUpdateId();
psql(serviceSql(claimUpdateSql(humanUpdateId, syntheticUserBase + 4, syntheticUserBase + 4)));
persistInbound(humanUpdateId, syntheticUserBase + 4, 'Synthetic message while human owns conversation');
const humanOwnedReply = telegramDispatchClaim(serviceSql(
  `select message_id::text || '|' || chat_id::text || '|' || should_dispatch::text || '|' || dispatch_status ` +
  `from public.claim_telegram_ai_reply(${botId}, ${humanUpdateId}, 'Must not dispatch', '{}'::jsonb)`,
));
assert.equal(humanOwnedReply, null, 'Nia claim must recheck mode after response preparation');
assert.equal(psql(
  `select state from public.telegram_updates where bot_id=${botId} and update_id=${humanUpdateId}`,
), 'human_owned');

const takeover = authenticatedSql(
  staffId,
  `update public.conversations set assigned_staff_id=${sqlLiteral(staffId)}::uuid ` +
  `where id=${sqlLiteral(handoffInbound.conversationId)}::uuid`,
);
psql(takeover);
const staffReplyKey = `synthetic-telegram-staff-${randomUUID()}`;
const staffClaimStatement = `select message_id::text || '|' || bot_id::text || '|' || chat_id::text || '|' || should_dispatch::text ` +
  `from public.claim_telegram_staff_reply(${sqlLiteral(handoffInbound.conversationId)}::uuid, ` +
  `'Synthetic staff reply', ${sqlLiteral(staffReplyKey)})`;
expectAuthenticatedSqlState(otherStaffId, '42501', staffClaimStatement);
expectAuthenticatedSqlState(restrictedStaffId, '42501', staffClaimStatement);
const [staffMessageId, staffBotId, staffChatId, staffShouldDispatch] = psql(
  authenticatedSql(staffId, staffClaimStatement),
).split('|');
assert.match(staffMessageId || '', /^[0-9a-f-]{36}$/i);
assert.equal(staffBotId, String(botId));
assert.equal(staffChatId, String(syntheticUserBase + 4));
assert.equal(staffShouldDispatch, 'true');
assert.deepEqual(finishDispatch(staffMessageId, 'accepted', 70001), {
  dispatchStatus: 'accepted',
  deliveryStatus: 'sent',
});
assert.equal(
  psql(`select telegram_message_id::text from public.telegram_message_dispatches where message_id=${sqlLiteral(staffMessageId)}::uuid;`),
  '70001',
  'API acceptance is tracked independently of unavailable Telegram delivery/read receipts',
);

psql(authenticatedSql(
  staffId,
  `select mode from public.return_to_ai(${sqlLiteral(handoffInbound.conversationId)}::uuid)`,
));
const aiUpdateId = newUpdateId();
psql(serviceSql(claimUpdateSql(aiUpdateId, syntheticUserBase + 4, syntheticUserBase + 4)));
const aiInbound = persistInbound(aiUpdateId, syntheticUserBase + 4, 'Synthetic grounded fee follow-up');
assert.equal(aiInbound.mode, 'AI_ACTIVE');
const aiClaim = telegramDispatchClaim(serviceSql(
  `select message_id::text || '|' || chat_id::text || '|' || should_dispatch::text || '|' || dispatch_status ` +
  `from public.claim_telegram_ai_reply(${botId}, ${aiUpdateId}, 'Synthetic grounded Nia answer', ` +
  `'{"selectedPropertyId":"synthetic-property"}'::jsonb)`,
));
assert.ok(aiClaim?.shouldDispatch);
assert.deepEqual(finishDispatch(aiClaim.messageId, 'accepted', 70002), {
  dispatchStatus: 'accepted',
  deliveryStatus: 'sent',
});
assert.equal(psql(
  `select nia_context->>'selectedPropertyId' from public.conversations where id=${sqlLiteral(aiInbound.conversationId)}::uuid;`,
), 'synthetic-property');

const uncertainUpdateId = newUpdateId();
psql(serviceSql(claimUpdateSql(uncertainUpdateId, syntheticUserBase + 5, syntheticUserBase + 5)));
const uncertainInbound = persistInbound(uncertainUpdateId, syntheticUserBase + 5, 'Synthetic uncertain send');
const uncertainClaim = telegramDispatchClaim(serviceSql(
  `select message_id::text || '|' || chat_id::text || '|' || should_dispatch::text || '|' || dispatch_status ` +
  `from public.claim_telegram_ai_reply(${botId}, ${uncertainUpdateId}, 'Synthetic uncertain reply', '{}'::jsonb)`,
));
assert.ok(uncertainClaim?.shouldDispatch);
assert.deepEqual(finishDispatch(uncertainClaim.messageId, 'unknown', null, 'NETWORK_OUTCOME_UNKNOWN'), {
  dispatchStatus: 'unknown',
  deliveryStatus: 'queued',
});
assert.equal(psql(serviceSql(claimUpdateSql(uncertainUpdateId, syntheticUserBase + 5, syntheticUserBase + 5))).split('|')[0], 'false');
psql(authenticatedSql(
  staffId,
  `update public.conversations set mode='HUMAN_ACTIVE', assigned_staff_id=${sqlLiteral(staffId)}::uuid ` +
  `where id=${sqlLiteral(uncertainInbound.conversationId)}::uuid`,
));
expectAuthenticatedSqlState(staffId, '55000', staffClaimStatement.replace(
  sqlLiteral(handoffInbound.conversationId),
  sqlLiteral(uncertainInbound.conversationId),
).replace(staffReplyKey, `synthetic-uncertain-follow-up-${randomUUID()}`));

const expiryUpdateId = newUpdateId();
psql(serviceSql(claimUpdateSql(expiryUpdateId, syntheticUserBase + 6, syntheticUserBase + 6)));
const expiryInbound = persistInbound(expiryUpdateId, syntheticUserBase + 6, 'Synthetic expired dispatch');
const expiryClaim = telegramDispatchClaim(serviceSql(
  `select message_id::text || '|' || chat_id::text || '|' || should_dispatch::text || '|' || dispatch_status ` +
  `from public.claim_telegram_ai_reply(${botId}, ${expiryUpdateId}, 'Synthetic stale reply', '{}'::jsonb)`,
));
assert.ok(expiryClaim?.shouldDispatch);
psql(
  `update public.telegram_message_dispatches set lease_expires_at=now()-interval '1 second' ` +
  `where message_id=${sqlLiteral(expiryClaim.messageId)}::uuid;`,
);
assert.ok(Number(psql(serviceSql('select public.mark_expired_telegram_dispatches_unknown()'))) >= 1);
assert.equal(psql(
  `select dispatch_status from public.messages where id=${sqlLiteral(expiryClaim.messageId)}::uuid;`,
), 'unknown');
assert.notEqual(expiryInbound.conversationId, handoffInbound.conversationId);

console.log('Disposable Supabase checks passed: website handoff GUC/staff replies, Telegram identity isolation, atomic deduplication, handoff/audit, ownership suppression, assigned staff authorization, AI resume/context persistence, API acceptance, and uncertain/expired no-resend state.');
