import { useState, type ReactNode } from "react";
import { AuthGate, type AppAuthProps } from "./AuthGate";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { VerifyEmailPage } from "./VerifyEmailPage";
import { readAccountId } from "./accountId";
import { APP_KEY, IDENTITY_BASE } from "./config";
import { createIdentityClient } from "./identityClient";
import { createTokenStore } from "./tokenStore";

/**
 * Lazy entry of the auth slice (production only): `/verify-email` or `/reset-password` first, then the gate.
 */
export default function AuthRoot({
  renderApp,
  verifyHash,
  resetHash = null,
}: {
  renderApp: (p?: AppAuthProps) => ReactNode;
  verifyHash: string | null;
  resetHash?: string | null;
}) {
  const [client] = useState(() => createIdentityClient({ baseUrl: IDENTITY_BASE, app: APP_KEY }));
  const [store] = useState(() => createTokenStore({ client }));
  const [view, setView] = useState<"verify" | "reset" | "app">(
    verifyHash ? "verify" : resetHash ? "reset" : "app",
  );
  const [notice, setNotice] = useState<"verified" | "password_reset" | null>(null);
  const [initialScreen, setInitialScreen] = useState<"signIn" | "forgot">("signIn");

  const leaveVerify = (withNotice: boolean) => {
    history.replaceState(null, "", "/");
    setNotice(withNotice ? "verified" : null);
    setView("app");
  };

  const leaveReset = (next: "password_reset" | "forgot" | null) => {
    history.replaceState(null, "", "/");
    setNotice(next === "password_reset" ? next : null);
    setInitialScreen(next === "forgot" ? "forgot" : "signIn");
    setView("app");
  };

  if (view === "reset" && resetHash) {
    return (
      <ResetPasswordPage
        hash={resetHash}
        client={client}
        onContinue={() => leaveReset("password_reset")}
        onRequestNew={() => leaveReset("forgot")}
      />
    );
  }
  if (view === "verify" && verifyHash) {
    return (
      <VerifyEmailPage
        hash={verifyHash}
        client={client}
        accountId={readAccountId()}
        onContinue={() => leaveVerify(true)}
        onGoSignIn={() => leaveVerify(false)}
      />
    );
  }
  return (
    <AuthGate
      store={store}
      client={client}
      renderApp={renderApp}
      notice={notice}
      initialScreen={initialScreen}
    />
  );
}
