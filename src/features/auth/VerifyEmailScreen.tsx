import { Btn } from "@/components/Btn";
import { AuthLayout } from "./AuthLayout";
import { AuthNotice } from "./AuthNotice";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { VerifyEmailScreenProps } from "./types";

export function VerifyEmailScreen(props: VerifyEmailScreenProps) {
  const { state, retryAfterSeconds, onContinue, onGoSignIn, onResend, resend } = props;
  const copy = AUTH_COPY;
  return (
    <AuthLayout title={copy.verify.title}>
      {state === "verifying" && (
        <AuthNotice kind="info" busy>
          {copy.verify.verifying}
        </AuthNotice>
      )}
      {state === "verified" && (
        <>
          <AuthNotice kind="info">{copy.verify.verified}</AuthNotice>
          <Btn type="button" kind="primary" onClick={onContinue}>
            {copy.verify.continue}
          </Btn>
        </>
      )}
      {state === "rate_limited" && (
        <AuthNotice kind="error">
          {authErrorMessage({ code: "rate_limited", retryAfterSeconds })}
        </AuthNotice>
      )}
      {state === "invalid" && (
        <>
          <AuthNotice kind="error">{authErrorMessage({ code: "token_invalid" })}</AuthNotice>
          {resend?.status === "sent" && (
            <AuthNotice kind="info">{copy.actions.resendSent}</AuthNotice>
          )}
          {resend?.error && <AuthNotice kind="error">{authErrorMessage(resend.error)}</AuthNotice>}
          {onResend ? (
            resend?.status !== "sent" && (
              <Btn
                type="button"
                kind="primary"
                onClick={onResend}
                disabled={resend?.status === "sending"}
              >
                {resend?.status === "sending" ? copy.actions.resending : copy.actions.resend}
              </Btn>
            )
          ) : (
            <Btn type="button" kind="primary" onClick={onGoSignIn}>
              {copy.verify.goSignIn}
            </Btn>
          )}
        </>
      )}
    </AuthLayout>
  );
}
