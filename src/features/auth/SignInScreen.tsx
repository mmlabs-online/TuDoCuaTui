import { useRef, useState } from "react";
import { Btn } from "@/components/Btn";
import { AuthField } from "./AuthField";
import { AuthLayout, LinkButton } from "./AuthLayout";
import { AuthNotice } from "./AuthNotice";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { SignInScreenProps } from "./types";
import { hasErrors, validateSignIn, type FieldErrors } from "./validation";

export function SignInScreen(props: SignInScreenProps) {
  const { status, error, notice, onSignIn, onGoSignUp, onResend, resend, turnstileSlot } = props;
  const [email, setEmail] = useState(props.initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors<"email" | "password">>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submitting = status === "submitting";
  const showTurnstile = error?.code === "turnstile_required" || error?.code === "turnstile_failed";
  const copy = AUTH_COPY;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const found = validateSignIn({ email, password });
    setErrors(found);
    if (hasErrors(found)) {
      (found.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    onSignIn({ email: email.trim(), password });
  }

  return (
    <AuthLayout title={copy.signIn.title}>
      {notice && (
        <AuthNotice kind="info">
          {notice === "verified" ? copy.signIn.verified : copy.signIn.signedOut}
        </AuthNotice>
      )}
      {error && (
        <AuthNotice
          kind="error"
          action={
            error.code === "email_unverified" && onResend && resend?.status !== "sent"
              ? {
                  label:
                    resend?.status === "sending" ? copy.actions.resending : copy.actions.resend,
                  onClick: onResend,
                  disabled: resend?.status === "sending",
                }
              : undefined
          }
        >
          {authErrorMessage(error)}
        </AuthNotice>
      )}
      {resend?.status === "sent" && <AuthNotice kind="info">{copy.actions.resendSent}</AuthNotice>}
      {resend?.error && <AuthNotice kind="error">{authErrorMessage(resend.error)}</AuthNotice>}
      <form method="post" noValidate onSubmit={submit} className="flex flex-col gap-3">
        <AuthField
          id="signin-email"
          ref={emailRef}
          label={copy.fields.email}
          type="email"
          autoComplete="email"
          value={email}
          error={errors.email && copy.fieldErrors[errors.email]}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors(({ email: _, ...rest }) => rest);
          }}
        />
        <AuthField
          id="signin-password"
          ref={passwordRef}
          label={copy.fields.password}
          type="password"
          autoComplete="current-password"
          value={password}
          error={errors.password && copy.fieldErrors[errors.password]}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors(({ password: _, ...rest }) => rest);
          }}
        />
        {showTurnstile && <div className="min-h-[65px]">{turnstileSlot}</div>}
        <Btn type="submit" kind="primary" disabled={submitting}>
          {submitting ? copy.signIn.submitting : copy.signIn.submit}
        </Btn>
      </form>
      <LinkButton onClick={onGoSignUp}>{copy.signIn.toSignUp}</LinkButton>
    </AuthLayout>
  );
}
