type SupabaseAuthErrorShape = {
  name?: string;
  status?: number;
  code?: string;
  message?: string;
};

export function isUnauthenticatedAuthError(error: SupabaseAuthErrorShape): boolean {
  return error.name === 'AuthSessionMissingError'
    || error.name === 'AuthInvalidJwtError'
    || error.status === 401
    || error.status === 403;
}

export function safeAuthErrorDiagnostic(error: SupabaseAuthErrorShape) {
  const code = error.code?.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 64) || 'unknown';
  const message = (error.message || 'No provider message')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[token]')
    .replace(/\b(password|access[_ -]?token|refresh[_ -]?token|token|secret|api[_ -]?key)\b\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 180);

  return {
    code,
    status: Number.isInteger(error.status) ? error.status : null,
    message,
  };
}
