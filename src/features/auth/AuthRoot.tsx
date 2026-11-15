import { useState, type ReactNode } from "react";
import { AuthGate, type AppAuthProps } from "./AuthGate";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { VerifyEmailPage } from "./VerifyEmailPage";
import { readAccountId } from "./accountId";
import { APP_KEY, IDENTITY_BASE } from "./config";
import { createIdentityClient } from "./identityClient";
import { createTokenStore } from "./tokenStore";

/**
 * Lazy entry of the auth slice (loaded only in api mode with identity auth, or on a token-page visit).
 * Identity mode: `/verify-email` or `/reset-password`, then the gate. Access mode: the same, then the plain app.
 */
export default function AuthRoot({
  renderApp,
  verifyHash,
  resetHash = null,
  identity,
}: {
  renderApp: (p?: AppAuthProps) => ReactNode;
  verifyHash: string | null;
  resetHash?: string | null;
  identity: boolean;
}) {
  const [client] = useState(() => createIdentityClient({ baseUrl: IDENTITY_BASE, app: APP_KEY }));
  const [store] = useState(() => (identity ? createTokenStore({ client }) : null));
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
        onRequestNew={store ? () => leaveReset("forgot") : undefined}
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
  if (store)
    return (
      <AuthGate
        store={store}
        client={client}
        renderApp={renderApp}
        notice={notice}
        initialScreen={initialScreen}
      />
    );
  return <>{renderApp()}</>;
}
