import { useRef, useState } from "react";
import { Btn } from "@/components/Btn";
import { AuthField } from "./AuthField";
import { AuthLayout, LinkButton } from "./AuthLayout";
import { AuthNotice } from "./AuthNotice";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { ForgotPasswordScreenProps } from "./types";
import { emailError } from "./validation";

export function ForgotPasswordScreen(props: ForgotPasswordScreenProps) {
  const { status, error, onSubmit, onGoSignIn, turnstileSlot } = props;
  const turnstileReady = props.turnstileReady ?? true;
  const [email, setEmail] = useState(props.initialEmail ?? "");
  const [fieldError, setFieldError] = useState<ReturnType<typeof emailError>>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const submitting = status === "submitting";
  const copy = AUTH_COPY;

  if (status === "sent") {
    return (
      <AuthLayout title={copy.forgot.sentTitle}>
        <AuthNotice kind="info">
          {copy.forgot.sentBody} {copy.forgot.sentNote}
        </AuthNotice>
        <LinkButton onClick={onGoSignIn}>{copy.forgot.toSignIn}</LinkButton>
      </AuthLayout>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !turnstileReady) return;
    const found = emailError(email);
    setFieldError(found);
    if (found) {
      emailRef.current?.focus();
      return;
    }
    onSubmit(email.trim());
  }

  return (
    <AuthLayout title={copy.forgot.title}>
      <p className="text-sm">{copy.forgot.intro}</p>
      {error && <AuthNotice kind="error">{authErrorMessage(error)}</AuthNotice>}
      <form method="post" noValidate onSubmit={submit} className="flex flex-col gap-3">
        <AuthField
          id="forgot-email"
          ref={emailRef}
          label={copy.fields.email}
          type="email"
          autoComplete="email"
          value={email}
          error={fieldError ? copy.fieldErrors[fieldError] : undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldError(null);
          }}
        />
        <div className="min-h-[65px]">{turnstileSlot}</div>
        <Btn type="submit" kind="primary" disabled={submitting || !turnstileReady}>
          {submitting ? copy.forgot.submitting : copy.forgot.submit}
        </Btn>
      </form>
      <LinkButton onClick={onGoSignIn}>{copy.forgot.toSignIn}</LinkButton>
    </AuthLayout>
  );
}
