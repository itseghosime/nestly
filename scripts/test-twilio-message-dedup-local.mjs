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
  const args = [
    'exec',
    container,
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-X',
    '-q',
    '-A',
    '-t',
    '-v',
    'ON_ERROR_STOP=1',
  ];
  args.push('-c', sql);
  return docker(args);
}

async function psqlAsync(sql) {
  const args = [
    'exec',
    container,
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-X',
    '-q',
    '-A',
    '-t',
    '-v',
    'ON_ERROR_STOP=1',
  ];
  args.push('-c', sql);
  try {
    const { stdout } = await execFileAsync('docker', args, { encoding: 'utf8' });
    return stdout.trim();
  } catch {
    throw new Error('Concurrent disposable Supabase SQL command failed');
  }
}

const schemaReady = psql(
  "select (to_regclass('public.customers') is not null)::text || '|' || " +
  "(to_regclass('public.conversations') is not null)::text || '|' || " +
  "(to_regclass('public.messages') is not null)::text;",
);
assert.equal(schemaReady, 'true|true|true', 'The disposable database must have the Nestly conversation schema');

const customerPhone = `+1555${randomInt(10_000_000, 99_999_999)}`;
let customerId;
let conversationId;
const sequentialSid = `SM${randomUUID().replaceAll('-', '').toUpperCase()}`;
const concurrentSid = `SM${randomUUID().replaceAll('-', '').toUpperCase()}`;

const claimSql = (sid) => `
with inserted as (
  insert into public.messages (
    conversation_id, provider_message_id, direction, sender_type,
    content, message_type, delivery_status
  )
  values (
    ${sqlLiteral(conversationId)}::uuid,
    ${sqlLiteral(sid)},
    'inbound',
    'customer',
    'synthetic MessageSid dedup probe',
    'text',
    'received'
  )
  on conflict (provider_message_id) do nothing
  returning id
)
select ${sqlLiteral(conversationId)} || '|' || exists (select 1 from inserted)::text;
`;

function claim(sid) {
  return readClaimResult(psql(claimSql(sid)));
}

async function claimConcurrent(sid) {
  return readClaimResult(await psqlAsync(claimSql(sid)));
}

function readClaimResult(result) {
  const [returnedConversationId, inserted] = result.split('|');
  assert.equal(returnedConversationId, conversationId, 'Every claim should return the synthetic conversation');
  assert.ok(inserted === 'true' || inserted === 'false', 'The atomic claim must return its insert outcome');
  return inserted === 'true';
}

let testPassed = false;
try {
  customerId = psql(
  "insert into public.customers (whatsapp_phone, full_name) " +
  `values (${sqlLiteral(customerPhone)}, 'Synthetic MessageSid Dedup Test') returning id::text;`,
  );
  assert.match(customerId, /^[0-9a-f-]{36}$/i);

  conversationId = psql(
    "insert into public.conversations (customer_id, mode) " +
    `values (${sqlLiteral(customerId)}::uuid, 'AI_ACTIVE') returning id::text;`,
  );
  assert.match(conversationId, /^[0-9a-f-]{36}$/i);

  assert.equal(claim(sequentialSid), true, 'The first sequential delivery must claim the SID');
  assert.equal(claim(sequentialSid), false, 'A sequential duplicate must not claim the SID twice');

  const concurrentResults = await Promise.all(
    Array.from({ length: 8 }, () => claimConcurrent(concurrentSid)),
  );
  assert.equal(
    concurrentResults.filter(Boolean).length,
    1,
    'Exactly one concurrent delivery must win the unique provider_message_id insert',
  );
  assert.equal(concurrentResults.filter((inserted) => !inserted).length, 7);

  const storedRows = psql(
    "select count(*)::text from public.messages " +
    `where conversation_id = ${sqlLiteral(conversationId)}::uuid ` +
    `and provider_message_id in (${sqlLiteral(sequentialSid)}, ${sqlLiteral(concurrentSid)});`,
  );
  assert.equal(storedRows, '2', 'Sequential and concurrent duplicates must create one row per SID');
  testPassed = true;
} finally {
  if (conversationId) {
    psql(
      "delete from public.messages " +
      `where conversation_id = ${sqlLiteral(conversationId)}::uuid ` +
      `and provider_message_id in (${sqlLiteral(sequentialSid)}, ${sqlLiteral(concurrentSid)}); ` +
      `delete from public.conversations where id = ${sqlLiteral(conversationId)}::uuid ` +
      `and customer_id = ${sqlLiteral(customerId)}::uuid;`,
    );
  }
  if (customerId) {
    psql(
      `delete from public.customers where id = ${sqlLiteral(customerId)}::uuid ` +
      `and whatsapp_phone = ${sqlLiteral(customerPhone)};`,
    );
  }
}

assert.equal(testPassed, true);
console.log('Local isolated Supabase dedup test passed: sequential duplicate and 8-way concurrent retry; synthetic rows cleaned.');
