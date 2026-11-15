import { useRef, useState } from "react";
import { Btn } from "@/components/Btn";
import { AuthField } from "./AuthField";
import { AuthLayout } from "./AuthLayout";
import { AuthNotice } from "./AuthNotice";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { ResetPasswordScreenProps } from "./types";
import { hasErrors, validateNewPassword, type FieldErrors } from "./validation";

/** Rendered only in ready / submitting, so done / invalid unmount it and drop the typed passwords. */
function ResetForm({
  submitting,
  onReset,
}: {
  submitting: boolean;
  onReset: (newPassword: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors<"password" | "confirm">>({});
  const refs = {
    password: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };
  const copy = AUTH_COPY;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const found = validateNewPassword({ password, confirm });
    setErrors(found);
    const first = (["password", "confirm"] as const).find((k) => found[k]);
    if (first) {
      refs[first].current?.focus();
      return;
    }
    onReset(password);
  }

  return (
    <form method="post" noValidate onSubmit={submit} className="flex flex-col gap-3">
      <AuthField
        id="reset-password"
        ref={refs.password}
        label={copy.fields.newPassword}
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
        id="reset-confirm"
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
      <Btn type="submit" kind="primary" disabled={submitting}>
        {submitting ? copy.reset.submitting : copy.reset.submit}
      </Btn>
    </form>
  );
}

export function ResetPasswordScreen(props: ResetPasswordScreenProps) {
  const { state, error, onReset, onContinue, onRequestNew } = props;
  const copy = AUTH_COPY;
  return (
    <AuthLayout title={copy.reset.title}>
      {(state === "ready" || state === "submitting") && (
        <>
          {error ? (
            <AuthNotice kind="error">{authErrorMessage(error)}</AuthNotice>
          ) : (
            <p className="text-sm">{copy.reset.intro}</p>
          )}
          <ResetForm submitting={state === "submitting"} onReset={onReset} />
        </>
      )}
      {state === "done" && (
        <>
          <AuthNotice kind="info">{copy.reset.done}</AuthNotice>
          <Btn type="button" kind="primary" onClick={onContinue}>
            {copy.reset.continue}
          </Btn>
        </>
      )}
      {state === "invalid" && (
        <>
          <AuthNotice kind="error">{copy.reset.invalid}</AuthNotice>
          <Btn type="button" kind="primary" onClick={onRequestNew ?? onContinue}>
            {onRequestNew ? copy.reset.requestNew : copy.reset.continue}
          </Btn>
        </>
      )}
    </AuthLayout>
  );
}
