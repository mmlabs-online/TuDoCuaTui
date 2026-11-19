import { Btn } from "@/components/Btn";
import { AuthLayout, LinkButton } from "./AuthLayout";
import { AuthNotice } from "./AuthNotice";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { UnverifiedScreenProps } from "./types";

/** Sign-in or restore got 403 `email_unverified`: resend the link, re-check, or leave. */
export function UnverifiedScreen({
  email,
  resend,
  still,
  onResend,
  onCheckAgain,
  onUseOtherAccount,
}: UnverifiedScreenProps) {
  const copy = AUTH_COPY;
  const sending = resend.status === "sending";
  return (
    <AuthLayout title={copy.unverified.title}>
      <AuthNotice kind="info">
        <span style={{ overflowWrap: "anywhere" }}>{copy.unverified.body(email)}</span>
      </AuthNotice>
      {still && <AuthNotice kind="error">{copy.errors.email_unverified}</AuthNotice>}
      {resend.status === "sent" && <AuthNotice kind="info">{copy.actions.resendSent}</AuthNotice>}
      {resend.error && <AuthNotice kind="error">{authErrorMessage(resend.error)}</AuthNotice>}
      <Btn type="button" kind="primary" onClick={onCheckAgain}>
        {copy.unverified.checkAgain}
      </Btn>
      {resend.status !== "sent" && (
        <Btn type="button" onClick={onResend} disabled={sending}>
          {sending ? copy.actions.resending : copy.actions.resend}
        </Btn>
      )}
      <LinkButton onClick={onUseOtherAccount}>{copy.unverified.otherAccount}</LinkButton>
    </AuthLayout>
  );
}
