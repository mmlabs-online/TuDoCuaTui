import { useRef, useState } from "react";
import { Btn } from "@/components/Btn";
import { AuthField } from "./AuthField";
import { AuthLayout, LinkButton } from "./AuthLayout";
import { AuthNotice } from "./AuthNotice";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { SignInScreenProps } from "./types";
import { hasErrors, validateSignIn, type FieldErrors } from "./validation";

export function SignInScreen(props: SignInScreenProps) {
  const {
    status,
    error,
    notice,
    onSignIn,
    onGoSignUp,
    onGoForgot,
    onResend,
    resend,
    turnstileSlot,
    accounts,
    onContinueAs,
    continuingId,
    onRetrySignOut,
    retryingSignOut,
  } = props;
  const [email, setEmail] = useState(props.initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<"email" | "password">>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submitting = status === "submitting";
  const showTurnstile =
    props.turnstileRequired ||
    error?.code === "turnstile_required" ||
    error?.code === "turnstile_failed";
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
        <AuthNotice
          kind="info"
          action={
            notice === "logout_unconfirmed" && onRetrySignOut
              ? {
                  label: retryingSignOut ? copy.signIn.retryingSignOut : copy.signIn.retrySignOut,
                  onClick: onRetrySignOut,
                  disabled: retryingSignOut,
                }
              : undefined
          }
        >
          {notice === "verified"
            ? copy.signIn.verified
            : notice === "password_reset"
              ? copy.signIn.passwordReset
              : notice === "logout_unconfirmed"
                ? copy.signIn.logoutUnconfirmed
                : copy.signIn.signedOut}
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
      {accounts && accounts.length > 0 && onContinueAs && (
        <>
          <section aria-label={copy.signIn.accountsLabel} className="flex flex-col gap-2">
            {accounts.map((a, i) => (
              <Btn
                key={a.accountId}
                type="button"
                kind={i === 0 ? "primary" : undefined}
                className="min-h-[44px]"
                disabled={submitting}
                onClick={() => onContinueAs(a)}
              >
                <span className="whitespace-normal break-all">
                  {continuingId === a.accountId
                    ? copy.signIn.continuing
                    : copy.signIn.continueAs(a.email)}
                </span>
              </Btn>
            ))}
          </section>
          <p className="text-center text-sm" style={{ color: "var(--muted)" }}>
            {copy.signIn.otherAccount}
          </p>
        </>
      )}
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
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          error={errors.password && copy.fieldErrors[errors.password]}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors(({ password: _, ...rest }) => rest);
          }}
        />
        <label
          className="flex min-h-[44px] items-center gap-2 text-xs"
          style={{ color: "var(--muted)" }}
        >
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
          />
          {copy.fields.showPassword}
        </label>
        {showTurnstile && <div className="min-h-[65px]">{turnstileSlot}</div>}
        <Btn type="submit" kind="primary" disabled={submitting}>
          {submitting ? copy.signIn.submitting : copy.signIn.submit}
        </Btn>
      </form>
      {onGoForgot && <LinkButton onClick={onGoForgot}>{copy.signIn.forgot}</LinkButton>}
      <LinkButton onClick={onGoSignUp}>{copy.signIn.toSignUp}</LinkButton>
    </AuthLayout>
  );
}
