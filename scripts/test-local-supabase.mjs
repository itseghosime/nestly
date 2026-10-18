import { execFileSync, spawnSync } from 'node:child_process';

const workdir = process.argv[2] || process.cwd();
const output = execFileSync(
  'npm',
  [
    'exec',
    '--yes',
    '--package',
    'supabase@2.121.0',
    '--',
    'supabase',
    'status',
    '--workdir',
    workdir,
    '--output',
    'env',
  ],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);

const localSettings = new Map();
for (const line of output.split(/\r?\n/)) {
  const separator = line.indexOf('=');
  if (separator < 1) continue;
  const name = line.slice(0, separator);
  let value = line.slice(separator + 1).trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  localSettings.set(name, value);
}

const testUrl = localSettings.get('API_URL');
if (!testUrl || !['localhost', '127.0.0.1', '::1'].includes(new URL(testUrl).hostname)) {
  throw new Error('Refusing to use a non-loopback Supabase URL for isolated tests');
}

const testEnv = {
  ...process.env,
  SUPABASE_TEST_URL: testUrl,
  SUPABASE_TEST_ANON_KEY: localSettings.get('ANON_KEY'),
  SUPABASE_TEST_SERVICE_ROLE_KEY: localSettings.get('SERVICE_ROLE_KEY'),
};
if (!testEnv.SUPABASE_TEST_ANON_KEY || !testEnv.SUPABASE_TEST_SERVICE_ROLE_KEY) {
  throw new Error('Local Supabase status did not provide the isolated test client keys');
}

const result = spawnSync(
  'npm',
  ['test', '--', 'tests/api/supabase-live.test.ts', 'tests/api/auth-flows.live.test.ts'],
  { stdio: 'inherit', env: testEnv },
);
process.exit(result.status ?? 1);
