type AuthInvitationError = {
  code?: string | null;
  message?: string | null;
};

type StaffInvitationFailure = {
  status: 429 | 502;
  error: string;
};

export function getStaffInvitationFailure(
  authError: AuthInvitationError,
): StaffInvitationFailure {
  const message = authError.message ?? '';
  const rateLimited = authError.code === 'over_email_send_rate_limit'
    || authError.code === 'email_rate_limit_exceeded'
    || /email.{0,40}(rate limit|too many)|rate limit.{0,40}email/i.test(message);

  if (rateLimited) {
    return {
      status: 429,
      error: 'Supabase Auth is temporarily limiting invitation emails. Wait before retrying.',
    };
  }

  return {
    status: 502,
    error: 'Unable to send the staff invitation. Verify Supabase Auth email configuration before retrying.',
  };
}
