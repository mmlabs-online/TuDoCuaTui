import { Btn } from "@/components/Btn";
import { AuthLayout, LinkButton } from "./AuthLayout";
import { AuthNotice } from "./AuthNotice";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { JoinScreenProps } from "./types";

/** "Continue as <email>": the click is the consent to join (D8). */
export function JoinScreen({ email, status, error, onJoin, onUseOtherAccount }: JoinScreenProps) {
  const copy = AUTH_COPY.join;
  const busy = status === "submitting";
  return (
    <AuthLayout title={copy.title}>
      <p className="text-sm">{copy.body}</p>
      <AuthNotice kind="info">{copy.privacy}</AuthNotice>
      {error && <AuthNotice kind="error">{authErrorMessage(error)}</AuthNotice>}
      <Btn type="button" kind="primary" onClick={onJoin} disabled={busy}>
        <span className="whitespace-normal break-all">
          {busy ? copy.joining : copy.continue(email)}
        </span>
      </Btn>
      <LinkButton onClick={onUseOtherAccount}>{copy.otherAccount}</LinkButton>
    </AuthLayout>
  );
}
