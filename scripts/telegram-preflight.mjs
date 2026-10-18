import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd());

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const tokenMatch = token?.match(/^([1-9]\d{4,19}):[A-Za-z0-9_-]{20,}$/);
const botConfigured = Boolean(tokenMatch && Number.isSafeInteger(Number(tokenMatch[1])));
const secretConfigured = Boolean(secret && /^[A-Za-z0-9_-]{32,256}$/.test(secret));
const outboundEnabled = process.env.TELEGRAM_OUTBOUND_ENABLED === 'true';

console.log('Telegram preflight (no network requests made)');
console.log(`TELEGRAM_BOT_TOKEN: ${botConfigured ? 'configured' : 'missing or invalid'}`);
console.log(`TELEGRAM_WEBHOOK_SECRET: ${secretConfigured ? 'configured' : 'missing or invalid'}`);
console.log(`TELEGRAM_OUTBOUND_ENABLED: ${outboundEnabled ? 'true' : 'false (safe default)'}`);
console.log(`Webhook readiness: ${botConfigured && secretConfigured ? 'configured; webhook registration still required' : 'blocked'}`);
console.log(`Outbound readiness: ${botConfigured && outboundEnabled ? 'enabled; no message was sent' : 'disabled or blocked'}`);
console.log('Token, secret, provider URL, and message content are never printed.');
