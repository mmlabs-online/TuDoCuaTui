import { useRef, useState } from "react";
import { Btn } from "@/components/Btn";
import { AuthField } from "./AuthField";
import { AuthLayout, LinkButton } from "./AuthLayout";
import { AuthNotice } from "./AuthNotice";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { SignUpScreenProps } from "./types";
import { hasErrors, validateSignUp, type FieldErrors } from "./validation";

export function SignUpScreen(props: SignUpScreenProps) {
  const { status, sentTo, error, onSignUp, onGoSignIn, turnstileSlot, onResend, resend } = props;
  const turnstileReady = props.turnstileReady ?? true;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors<"email" | "password" | "confirm">>({});
  const refs = {
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };
  const submitting = status === "submitting";
  const copy = AUTH_COPY;

  if (status === "sent") {
    return (
      <AuthLayout title={copy.signUp.sentTitle}>
        <AuthNotice kind="info">
          {copy.signUp.sentBody(sentTo ?? "")} {copy.signUp.sentNote}
        </AuthNotice>
        {resend?.status === "sent" && (
          <AuthNotice kind="info">{copy.actions.resendSent}</AuthNotice>
        )}
        {resend?.error && <AuthNotice kind="error">{authErrorMessage(resend.error)}</AuthNotice>}
        {onResend && resend?.status !== "sent" && (
          <Btn type="button" onClick={onResend} disabled={resend?.status === "sending"}>
            {resend?.status === "sending" ? copy.actions.resending : copy.actions.resend}
          </Btn>
        )}
        <LinkButton onClick={onGoSignIn}>{copy.actions.goSignIn}</LinkButton>
      </AuthLayout>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !turnstileReady) return;
    const found = validateSignUp({ email, password, confirm });
    setErrors(found);
    const first = (["email", "password", "confirm"] as const).find((k) => found[k]);
    if (first) {
      refs[first].current?.focus();
      return;
    }
    onSignUp({ email: email.trim(), password });
  }

  return (
    <AuthLayout title={copy.signUp.title}>
      {error && (
        <AuthNotice
          kind="error"
          action={
            error.code === "email_taken"
              ? { label: copy.actions.goSignIn, onClick: onGoSignIn }
              : undefined
          }
        >
          {authErrorMessage(error)}
        </AuthNotice>
      )}
      <form method="post" noValidate onSubmit={submit} className="flex flex-col gap-3">
        <AuthField
          id="signup-email"
          ref={refs.email}
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
          id="signup-password"
          ref={refs.password}
          label={copy.fields.password}
          type="password"
          autoComplete="new-password"
          hint={copy.signUp.passwordHint}
          value={password}
          error={errors.password && copy.fieldErrors[errors.password]}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors(({ password: _, ...rest }) => rest);
          }}
        />
        <AuthField
          id="signup-confirm"
          ref={refs.confirm}
          label={copy.fields.confirm}
          type="password"
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm && copy.fieldErrors[errors.confirm]}
          onChange={(e) => {
            setConfirm(e.target.value);
            setErrors(({ confirm: _, ...rest }) => rest);
          }}
        />
        <div className="min-h-[65px]">{turnstileSlot}</div>
        <Btn type="submit" kind="primary" disabled={submitting || !turnstileReady}>
          {submitting ? copy.signUp.submitting : copy.signUp.submit}
        </Btn>
      </form>
      <LinkButton onClick={onGoSignIn}>{copy.signUp.toSignIn}</LinkButton>
    </AuthLayout>
  );
}
