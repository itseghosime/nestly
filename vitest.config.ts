import path from 'path';
import { loadEnv } from 'vite';

const testEnvironment = loadEnv('test', process.cwd(), 'SUPABASE_TEST_');
for (const [key, value] of Object.entries(testEnvironment)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const config = {
  resolve: { alias: { '@': path.resolve('.', '.') } },
  test: { include: ['tests/**/*.test.ts'] },
};

export default config;
