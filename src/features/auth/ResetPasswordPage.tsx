import { useState } from "react";
import { ResetPasswordScreen } from "./ResetPasswordScreen";
import type { IdentityClient } from "./identityClient";
import type { AuthError, ResetState } from "./types";
import { parseResetToken } from "./validation";

/**
 * `/reset-password`: the token is held in local state only, never rendered or logged, and is sent in a
 * POST body only when the user submits the form (D36). It is dropped once it is spent or invalid.
 */
export function ResetPasswordPage({
  hash,
  client,
  onContinue,
  onRequestNew,
}: {
  hash: string;
  client: IdentityClient;
  /** After success, or after an invalid link when `onRequestNew` is absent. */
  onContinue: () => void;
  onRequestNew?: () => void;
}) {
  const [token, setToken] = useState(() => parseResetToken(hash));
  const [state, setState] = useState<ResetState>(token ? "ready" : "invalid");
  const [error, setError] = useState<AuthError | null>(null);

  const reset = async (newPassword: string) => {
    if (!token || state === "submitting") return;
    setState("submitting");
    setError(null);
    try {
      await client.resetPassword({ token, newPassword });
      setToken(null);
      setState("done");
    } catch (e) {
      const err = e as AuthError;
      if (err.code === "token_invalid" || err.code === "validation_error") {
        setToken(null);
        setState("invalid");
      } else {
        setError(err); // weak_password and transient errors: the link still works
        setState("ready");
      }
    }
  };

  return (
    <ResetPasswordScreen
      state={state}
      error={error}
      onReset={reset}
      onContinue={onContinue}
      onRequestNew={onRequestNew}
    />
  );
}
