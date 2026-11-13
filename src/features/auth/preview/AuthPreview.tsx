import { useState } from "react";
import { SignInScreen } from "../SignInScreen";
import { SignUpScreen } from "../SignUpScreen";
import { VerifyEmailScreen } from "../VerifyEmailScreen";
import { AUTH_COPY, authErrorMessage } from "../copy";
import type { AuthError, AuthErrorCode, SubmitStatus, VerifyState } from "../types";

type Screen = "signIn" | "signUp" | "verify";
const ERROR_CODES = Object.keys(AUTH_COPY.errors).filter(
  (k) => !k.startsWith("weak_too"),
) as AuthErrorCode[];
const STATES: Record<Screen, string[]> = {
  signIn: ["idle", "submitting"],
  signUp: ["idle", "submitting", "sent"],
  verify: ["verifying", "verified", "invalid", "rate_limited"],
};

export function AuthPreview() {
  const p = AUTH_COPY.preview;
  const [screen, setScreen] = useState<Screen>("signIn");
  const [state, setState] = useState("idle");
  const [code, setCode] = useState<AuthErrorCode | "">("");
  const [dark, setDark] = useState(document.documentElement.classList.contains("dark"));
  const [narrow, setNarrow] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const error: AuthError | null = code
    ? { code, retryAfterSeconds: 120, reasons: ["too_short", "too_common"] }
    : null;
  const say = (line: string) => setLog((l) => [line, ...l].slice(0, 20));
  const slot = <div className="border border-dashed p-4 text-center text-xs">{p.turnstile}</div>;
  const status = (state === "submitting" ? "submitting" : "idle") as SubmitStatus;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 p-3 text-xs">
        <strong>{p.title}</strong>
        <select
          aria-label={p.screen}
          value={screen}
          onChange={(e) => {
            const s = e.target.value as Screen;
            setScreen(s);
            setState(STATES[s][0]);
          }}
        >
          {(Object.keys(STATES) as Screen[]).map((s) => (
            <option key={s} value={s}>
              {p[s]}
            </option>
          ))}
        </select>
        <select aria-label={p.state} value={state} onChange={(e) => setState(e.target.value)}>
          {STATES[screen].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label={p.error}
          value={code}
          onChange={(e) => setCode(e.target.value as AuthErrorCode | "")}
        >
          <option value="">{p.none}</option>
          {ERROR_CODES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={dark}
            onChange={(e) => {
              setDark(e.target.checked);
              document.documentElement.classList.toggle("dark", e.target.checked);
            }}
          />{" "}
          {p.dark}
        </label>
        <label>
          <input type="checkbox" checked={narrow} onChange={(e) => setNarrow(e.target.checked)} />{" "}
          {p.frame}
        </label>
      </div>
      <div className={narrow ? "mx-auto w-[390px] max-w-full" : ""}>
        {screen === "signIn" && (
          <SignInScreen
            status={status}
            error={error}
            turnstileSlot={slot}
            onSignIn={(v) => say(`signIn ${v.email} (${[...v.password].length})`)}
            onGoSignUp={() => say("goSignUp")}
            onResend={() => say("resend")}
          />
        )}
        {screen === "signUp" && (
          <SignUpScreen
            status={state === "sent" ? "sent" : status}
            sentTo="an@example.com"
            error={error}
            turnstileSlot={slot}
            onSignUp={(v) => say(`signUp ${v.email} (${[...v.password].length})`)}
            onGoSignIn={() => say("goSignIn")}
            onResend={() => say("resend")}
          />
        )}
        {screen === "verify" && (
          <VerifyEmailScreen
            state={state as VerifyState}
            retryAfterSeconds={45}
            onContinue={() => say("continue")}
            onGoSignIn={() => say("goSignIn")}
            onResend={() => say("resend")}
          />
        )}
      </div>
      <pre className="p-3 text-xs" aria-label={p.log}>
        {error ? authErrorMessage(error) + "\n" : ""}
        {log.join("\n")}
      </pre>
    </div>
  );
}
