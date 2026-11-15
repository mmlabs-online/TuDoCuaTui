import { useState } from "react";
import { VerifyEmailScreen } from "./VerifyEmailScreen";
import type { IdentityClient } from "./identityClient";
import type { AuthError, ResendState, VerifyState } from "./types";
import { parseVerifyToken } from "./validation";

/**
 * `/verify-email`: the token is held in local state only, never rendered or logged, and is sent
 * in a POST body only when the user presses the button (D36).
 */
export function VerifyEmailPage({
  hash,
  client,
  accountId,
  onContinue,
  onGoSignIn,
}: {
  hash: string;
  client: IdentityClient;
  /** Enables "resend" on an invalid link; null when this device has no account session. */
  accountId: string | null;
  onContinue: () => void;
  onGoSignIn: () => void;
}) {
  const [token] = useState(() => parseVerifyToken(hash));
  const [state, setState] = useState<VerifyState>(token ? "ready" : "invalid");
  const [error, setError] = useState<AuthError | null>(null);
  const [resend, setResend] = useState<ResendState>({ status: "idle" });
  const [canResend, setCanResend] = useState(accountId !== null);

  const verify = async () => {
    if (!token || state === "verifying") return;
    setState("verifying");
    setError(null);
    try {
      await client.verifyEmail(token);
      setState("verified");
    } catch (e) {
      const err = e as AuthError;
      if (err.code === "token_invalid" || err.code === "validation_error") {
        setState("invalid");
      } else {
        setError(err); // retryable: the single-use token is still valid
        setState("ready");
      }
    }
  };

  const resendVerification = async () => {
    if (!accountId) return;
    setResend({ status: "sending" });
    try {
      await client.resendVerification(accountId);
      setResend({ status: "sent" });
    } catch (e) {
      const err = e as AuthError;
      setResend({ status: "idle", error: null });
      if (err.code === "email_already_verified") setState("verified");
      else if (err.code === "session_invalid") setCanResend(false);
      else setResend({ status: "idle", error: err });
    }
  };

  return (
    <VerifyEmailScreen
      state={state}
      error={error}
      onVerify={verify}
      onContinue={onContinue}
      onGoSignIn={onGoSignIn}
      onResend={canResend ? resendVerification : undefined}
      resend={resend}
    />
  );
}
