import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const container = process.env.SUPABASE_TEST_DB_CONTAINER;
if (!container || !/^supabase_db_.*(?:isolated|telegram-fresh).*$/i.test(container)) {
  throw new Error('Set SUPABASE_TEST_DB_CONTAINER to a running disposable Supabase DB container named with "isolated" or "telegram-fresh"');
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

const schemaReady = psql(
  "select (to_regclass('public.telegram_identities') is not null)::text || '|' || " +
  "(to_regclass('public.telegram_updates') is not null)::text || '|' || " +
  "(to_regclass('public.telegram_message_dispatches') is not null)::text || '|' || " +
  "(to_regclass('public.telegram_dispatch_reviews') is not null)::text || '|' || " +
  "(to_regprocedure('public.claim_telegram_update(bigint,bigint,bigint,bigint)') is not null)::text || '|' || " +
  "(to_regprocedure('public.persist_telegram_inbound(bigint,bigint,bigint,bigint,text,text,text)') is not null)::text || '|' || " +
  "(to_regprocedure('public.claim_telegram_ai_reply(bigint,bigint,text,jsonb)') is not null)::text || '|' || " +
  "(to_regprocedure('public.claim_telegram_staff_reply(uuid,text,text)') is not null)::text || '|' || " +
  "(to_regprocedure('public.finish_telegram_dispatch(uuid,text,bigint,text)') is not null)::text || '|' || " +
  "(to_regprocedure('public.mark_expired_telegram_dispatches_unknown()') is not null)::text || '|' || " +
  "(to_regprocedure('public.acknowledge_telegram_unknown_send(uuid,uuid,boolean)') is not null)::text;",
);
assert.equal(schemaReady, 'true|true|true|true|true|true|true|true|true|true|true',
  'Run all repository migrations on the fresh disposable Supabase database first');

const privileges = psql(
  "select has_table_privilege('anon', 'public.telegram_identities', 'SELECT')::text || '|' || " +
  "has_table_privilege('authenticated', 'public.telegram_identities', 'SELECT')::text || '|' || " +
  "has_table_privilege('service_role', 'public.telegram_updates', 'SELECT')::text || '|' || " +
  "has_table_privilege('anon', 'public.telegram_dispatch_reviews', 'SELECT')::text || '|' || " +
  "has_table_privilege('authenticated', 'public.telegram_dispatch_reviews', 'SELECT')::text || '|' || " +
  "has_function_privilege('anon', 'public.acknowledge_telegram_unknown_send(uuid,uuid,boolean)', 'EXECUTE')::text || '|' || " +
  "has_function_privilege('authenticated', 'public.acknowledge_telegram_unknown_send(uuid,uuid,boolean)', 'EXECUTE')::text || '|' || " +
  "has_function_privilege('anon', 'public.claim_telegram_update(bigint,bigint,bigint,bigint)', 'EXECUTE')::text || '|' || " +
  "has_function_privilege('service_role', 'public.claim_telegram_update(bigint,bigint,bigint,bigint)', 'EXECUTE')::text;",
);
assert.equal(privileges, 'false|true|false|false|true|false|true|false|true',
  'Telegram internals must remain private with reviewed state limited to accessible staff');

const staffId = randomUUID();
const otherStaffId = randomUUID();
const restrictedStaffId = randomUUID();
for (const [userId, label, role] of [
  [staffId, 'Synthetic Telegram Staff One', 'Platform Admin'],
  [otherStaffId, 'Synthetic Telegram Staff Two', 'Platform Admin'],
  [restrictedStaffId, 'Synthetic Telegram Restricted Staff', 'Legal & Compliance'],
]) {
  psql(
    `insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) ` +
    `values (${sqlLiteral(userId)}::uuid, 'authenticated', 'authenticated', ` +
    `${sqlLiteral(`${userId}@telegram.test.invalid`)}, now(), ` +
    `'{"provider":"email","providers":["email"]}'::jsonb, ` +
    `${sqlLiteral(JSON.stringify({ full_name: label }))}::jsonb); ` +
    `insert into public.profiles (id, display_name, role) values ` +
    `(${sqlLiteral(userId)}::uuid, ${sqlLiteral(label)}, ${sqlLiteral(role)});`,
  );
}

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
psql(authenticatedSql(
  staffId,
  `update public.conversations set assigned_staff_id=${sqlLiteral(staffId)}::uuid ` +
  `where id=${sqlLiteral(websiteConversationId)}::uuid`,
));
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

const crashUpdateId = newUpdateId();
const crashUserId = syntheticUserBase + 8;
assert.equal(psql(serviceSql(
  `select should_process::text || '|' || state || '|' || attempt_count::text ` +
  `from public.claim_telegram_update(${botId}, ${crashUpdateId}, ${crashUserId}, ${crashUserId})`,
)), 'true|processing|1');
psql(
  `update public.telegram_updates set lease_expires_at=now()-interval '1 second' ` +
  `where bot_id=${botId} and update_id=${crashUpdateId};`,
);
assert.equal(psql(serviceSql(
  `select should_process::text || '|' || state || '|' || attempt_count::text ` +
  `from public.claim_telegram_update(${botId}, ${crashUpdateId}, ${crashUserId}, ${crashUserId})`,
)), 'true|processing|2', 'Redelivery must reclaim an expired processing lease after a crashed worker');
const recoveredInbound = persistInbound(crashUpdateId, crashUserId, 'Synthetic recovered update');
assert.equal(
  persistInbound(crashUpdateId, crashUserId, 'Synthetic recovered update').messageId,
  recoveredInbound.messageId,
);
assert.equal(psql(
  `select count(*)::text from public.messages ` +
  `where idempotency_key=${sqlLiteral(`telegram:${botId}:${crashUpdateId}`)};`,
), '1', 'Crash recovery must preserve exactly one inbound message');
const recoveredDispatch = telegramDispatchClaim(serviceSql(
  `select message_id::text || '|' || chat_id::text || '|' || should_dispatch::text || '|' || dispatch_status ` +
  `from public.claim_telegram_ai_reply(${botId}, ${crashUpdateId}, 'Synthetic recovered answer', '{}'::jsonb)`,
));
assert.ok(recoveredDispatch?.shouldDispatch);
assert.equal(psql(serviceSql(claimUpdateSql(crashUpdateId, crashUserId, crashUserId))),
  'false|dispatching', 'A duplicate must not re-enter an already claimed dispatch');
assert.equal(psql(
  `select count(*)::text from public.telegram_message_dispatches ` +
  `where bot_id=${botId} and update_id=${crashUpdateId};`,
), '1', 'A recovered update must have at most one provider dispatch claim');

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

const raceUpdateId = newUpdateId();
psql(serviceSql(claimUpdateSql(raceUpdateId, syntheticUserBase + 7, syntheticUserBase + 7)));
const raceInbound = persistInbound(raceUpdateId, syntheticUserBase + 7, 'Synthetic takeover race');
const raceAiClaimSql = `select message_id::text || '|' || chat_id::text || '|' || should_dispatch::text || '|' || dispatch_status ` +
  `from public.claim_telegram_ai_reply(${botId}, ${raceUpdateId}, 'Synthetic race answer', '{}'::jsonb)`;
const takeoverRaceSql = `
  do $test$
  declare blocked boolean := false;
  begin
    begin
      update public.conversations
      set mode='HUMAN_ACTIVE', assigned_staff_id=${sqlLiteral(staffId)}::uuid
      where id=${sqlLiteral(raceInbound.conversationId)}::uuid;
    exception when sqlstate '55000' then
      blocked := true;
    end;
    perform set_config('nestly.test_takeover_blocked', blocked::text, true);
  end
  $test$;
  select current_setting('nestly.test_takeover_blocked');
`;
const [raceAiOutput, raceTakeoverOutput] = await Promise.all([
  psqlAsync(serviceSql(`${raceAiClaimSql}; select pg_sleep(0.5)`)),
  psqlAsync(authenticatedSql(staffId, takeoverRaceSql)),
]);
const raceAiRow = raceAiOutput.split(/\r?\n/)[0] || '';
const raceAiDispatched = raceAiRow.split('|')[2] === 'true';
const raceTakeoverBlocked = raceTakeoverOutput === 'true';
assert.equal(raceTakeoverBlocked, raceAiDispatched,
  'Exactly one of AI dispatch or staff takeover may win the ownership race');
if (raceAiDispatched) {
  const [raceMessageId] = raceAiRow.split('|');
  assert.deepEqual(finishDispatch(raceMessageId, 'rejected', null, 'OUTBOUND_DISABLED'), {
    dispatchStatus: 'failed',
    deliveryStatus: 'failed',
  });
  psql(authenticatedSql(
    staffId,
    `update public.conversations set mode='HUMAN_ACTIVE', assigned_staff_id=${sqlLiteral(staffId)}::uuid ` +
    `where id=${sqlLiteral(raceInbound.conversationId)}::uuid`,
  ));
}

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
const uncertainStaffKey = `synthetic-uncertain-follow-up-${randomUUID()}`;
const uncertainStaffClaimSql = `select message_id::text || '|' || should_dispatch::text ` +
  `from public.claim_telegram_staff_reply(${sqlLiteral(uncertainInbound.conversationId)}::uuid, ` +
  `'Synthetic follow-up after review', ${sqlLiteral(uncertainStaffKey)})`;
expectAuthenticatedSqlState(staffId, '55000', uncertainStaffClaimSql);
expectAuthenticatedSqlState(otherStaffId, '42501',
  `select * from public.acknowledge_telegram_unknown_send(${sqlLiteral(uncertainInbound.conversationId)}::uuid, ` +
  `${sqlLiteral(uncertainClaim.messageId)}::uuid, true)`);
expectAuthenticatedSqlState(staffId, '42501',
  `select * from public.acknowledge_telegram_unknown_send(${sqlLiteral(uncertainInbound.conversationId)}::uuid, ` +
  `${sqlLiteral(uncertainClaim.messageId)}::uuid, false)`);
const uncertaintyReview = psql(authenticatedSql(
  staffId,
  `select message_id::text || '|' || conversation_id::text || '|' || reviewed_by::text ` +
  `from public.acknowledge_telegram_unknown_send(${sqlLiteral(uncertainInbound.conversationId)}::uuid, ` +
  `${sqlLiteral(uncertainClaim.messageId)}::uuid, true)`,
));
assert.equal(uncertaintyReview,
  `${uncertainClaim.messageId}|${uncertainInbound.conversationId}|${staffId}`);
assert.equal(psql(
  `select count(*)::text from public.audit_logs where action='telegram.dispatch.unknown_follow_up_acknowledged' ` +
  `and entity_id=${sqlLiteral(uncertainClaim.messageId)}::uuid`,
), '1', 'Explicit uncertainty review must be recorded in the audit log');
assert.equal(psql(
  `select dispatch_status from public.messages where id=${sqlLiteral(uncertainClaim.messageId)}::uuid`,
), 'unknown', 'Acknowledging uncertainty must not turn it into delivery evidence');
assert.equal(psql(authenticatedSql(
  staffId,
  `select message_id::text || '|' || conversation_id::text || '|' || reviewed_by::text ` +
  `from public.acknowledge_telegram_unknown_send(${sqlLiteral(uncertainInbound.conversationId)}::uuid, ` +
  `${sqlLiteral(uncertainClaim.messageId)}::uuid, true)`,
)), uncertaintyReview, 'Repeated acknowledgement must be idempotent');
assert.equal(psql(
  `select count(*)::text from public.audit_logs where action='telegram.dispatch.unknown_follow_up_acknowledged' ` +
  `and entity_id=${sqlLiteral(uncertainClaim.messageId)}::uuid`,
), '1', 'Repeated acknowledgement must not duplicate its audit event');
const followUpClaim = psql(authenticatedSql(staffId, uncertainStaffClaimSql));
const [followUpMessageId, followUpShouldDispatch] = followUpClaim.split('|');
assert.match(followUpMessageId || '', /^[0-9a-f-]{36}$/i);
assert.equal(followUpShouldDispatch, 'true',
  'An acknowledged unknown must permit a new staff reply without retrying the original');
assert.equal(psql(authenticatedSql(staffId, uncertainStaffClaimSql)), `${followUpMessageId}|false`,
  'Retrying the new staff request with its same idempotency key must not send twice');
assert.deepEqual(finishDispatch(followUpMessageId, 'rejected', null, 'OUTBOUND_DISABLED'), {
  dispatchStatus: 'failed',
  deliveryStatus: 'failed',
});

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
const overlappingRecoveryRuns = await Promise.all([
  psqlAsync(serviceSql('select public.mark_expired_telegram_dispatches_unknown()')),
  psqlAsync(serviceSql('select public.mark_expired_telegram_dispatches_unknown()')),
]);
assert.deepEqual(overlappingRecoveryRuns.sort(), ['0', '1'],
  'Overlapping recovery jobs must mark an expired dispatch unknown exactly once');
assert.equal(psql(
  `select dispatch_status from public.messages where id=${sqlLiteral(expiryClaim.messageId)}::uuid;`,
), 'unknown');
assert.equal(psql(
  `select state from public.telegram_message_dispatches where message_id=${sqlLiteral(expiryClaim.messageId)}::uuid;`,
), 'unknown');
assert.equal(psql(
  `select state from public.telegram_updates where bot_id=${botId} and update_id=${expiryUpdateId};`,
), 'unknown');
assert.equal(psql(serviceSql(claimUpdateSql(expiryUpdateId, syntheticUserBase + 6, syntheticUserBase + 6))).split('|')[0], 'false',
  'Recovery must not make an expired update processable for an automatic resend');
assert.deepEqual(finishDispatch(expiryClaim.messageId, 'accepted', 70003), {
  dispatchStatus: 'accepted',
  deliveryStatus: 'sent',
}, 'A late, explicitly confirmed provider response may refine unknown to accepted');
assert.equal(psql(
  `select telegram_message_id::text from public.telegram_message_dispatches ` +
  `where message_id=${sqlLiteral(expiryClaim.messageId)}::uuid;`,
), '70003');
assert.notEqual(expiryInbound.conversationId, handoffInbound.conversationId);

console.log('Fresh-migration Supabase checks passed: website handoff GUC/staff replies, grants/RLS, Telegram identity isolation, atomic deduplication, handoff/audit, takeover races, unknown-send review, overlapping recovery, late provider response, and no-resend crash recovery.');
