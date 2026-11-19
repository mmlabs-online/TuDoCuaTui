import { useState } from "react";
import { ResetPasswordScreen } from "../ResetPasswordScreen";
import { SignInScreen } from "../SignInScreen";
import { ForgotPasswordScreen } from "../ForgotPasswordScreen";
import { JoinScreen } from "../JoinScreen";
import { SignUpScreen } from "../SignUpScreen";
import { UnverifiedScreen } from "../UnverifiedScreen";
import { VerifyEmailScreen } from "../VerifyEmailScreen";
import { AUTH_COPY, authErrorMessage } from "../copy";
import type {
  AccountChoice,
  AuthError,
  AuthErrorCode,
  ResetState,
  SubmitStatus,
  VerifyState,
} from "../types";

type Screen = "signIn" | "signUp" | "verify" | "unverified" | "join" | "forgot" | "reset";
const ACCOUNTS: AccountChoice[] = [
  { accountId: "00000000-0000-4000-8000-000000000001", email: "an@example.com" },
  { accountId: "00000000-0000-4000-8000-000000000002", email: "binh@example.com" },
  { accountId: "00000000-0000-4000-8000-000000000003", email: "chi@example.com" },
];
const LONG_EMAIL = "nguyen.thi.thu.trang.dangky.taikhoan.moi.2026@example-dai.com";
const ACCOUNTS_LONG: AccountChoice[] = [
  { accountId: "00000000-0000-4000-8000-000000000004", email: LONG_EMAIL },
  ACCOUNTS[0],
];
const ERROR_CODES = Object.keys(AUTH_COPY.errors).filter(
  (k) => !k.startsWith("weak_too"),
) as AuthErrorCode[];
const STATES: Record<Screen, string[]> = {
  signIn: ["idle", "submitting", "logout_unconfirmed", "accounts", "accounts_long", "continuing"],
  signUp: ["idle", "submitting", "sent"],
  join: ["idle", "submitting"],
  forgot: ["idle", "submitting", "sent"],
  reset: ["ready", "submitting", "done", "invalid"],
  verify: ["ready", "verifying", "verified", "invalid", "rate_limited"],
  unverified: ["idle", "sending", "sent", "still"],
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
  const status = (
    state === "submitting" || state === "continuing" ? "submitting" : "idle"
  ) as SubmitStatus;
  const listed =
    state === "accounts_long"
      ? ACCOUNTS_LONG
      : state.startsWith("accounts") || state === "continuing"
        ? ACCOUNTS
        : [];

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
            notice={state === "logout_unconfirmed" ? "logout_unconfirmed" : null}
            turnstileSlot={slot}
            onSignIn={(v) => say(`signIn ${v.email} (${[...v.password].length})`)}
            onGoSignUp={() => say("goSignUp")}
            onGoForgot={() => say("goForgot")}
            onResend={() => say("resend")}
            accounts={listed}
            onContinueAs={(a) => say(`continueAs ${a.email}`)}
            continuingId={state === "continuing" ? ACCOUNTS[0].accountId : null}
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
        {screen === "forgot" && (
          <ForgotPasswordScreen
            status={state === "sent" ? "sent" : status}
            error={error}
            turnstileSlot={slot}
            onSubmit={(email) => say(`forgot ${email}`)}
            onGoSignIn={() => say("goSignIn")}
          />
        )}
        {screen === "reset" && (
          <ResetPasswordScreen
            state={state as ResetState}
            error={state === "ready" ? error : null}
            onReset={(pw) => say(`reset (${[...pw].length})`)}
            onContinue={() => say("continue")}
            onRequestNew={() => say("requestNew")}
          />
        )}
        {screen === "join" && (
          <JoinScreen
            email="an@example.com"
            status={status}
            error={error}
            onJoin={() => say("join")}
            onUseOtherAccount={() => say("useOtherAccount")}
          />
        )}
        {screen === "unverified" && (
          <UnverifiedScreen
            email={state === "idle" ? LONG_EMAIL : "an@example.com"}
            resend={{
              status: state === "sending" ? "sending" : state === "sent" ? "sent" : "idle",
            }}
            still={state === "still"}
            onResend={() => say("resend")}
            onCheckAgain={() => say("checkAgain")}
            onUseOtherAccount={() => say("useOtherAccount")}
          />
        )}
        {screen === "verify" && (
          <VerifyEmailScreen
            state={state as VerifyState}
            retryAfterSeconds={45}
            error={state === "ready" ? error : null}
            onVerify={() => say("verify")}
            onContinue={() => say("continue")}
            onGoSignIn={() => say("goSignIn")}
            onResend={() => say("resend")}
          />
        )}
      </div>
      <pre className="p-3 text-xs whitespace-pre-wrap" aria-label={p.log}>
        {error ? authErrorMessage(error) + "\n" : ""}
        {log.join("\n")}
      </pre>
    </div>
  );
}
