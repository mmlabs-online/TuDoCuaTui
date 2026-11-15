import { useState, type ReactNode } from "react";
import { AuthGate, type AppAuthProps } from "./AuthGate";
import { VerifyEmailPage } from "./VerifyEmailPage";
import { readAccountId } from "./accountId";
import { APP_KEY, IDENTITY_BASE } from "./config";
import { createIdentityClient } from "./identityClient";
import { createTokenStore } from "./tokenStore";

/**
 * Lazy entry of the auth slice (loaded only in api mode with identity auth, or on a /verify-email visit).
 * Identity mode: `/verify-email` then the gate. Access mode: `/verify-email` then the plain app.
 */
export default function AuthRoot({
  renderApp,
  verifyHash,
  identity,
}: {
  renderApp: (p?: AppAuthProps) => ReactNode;
  verifyHash: string | null;
  identity: boolean;
}) {
  const [client] = useState(() => createIdentityClient({ baseUrl: IDENTITY_BASE, app: APP_KEY }));
  const [store] = useState(() => (identity ? createTokenStore({ client }) : null));
  const [view, setView] = useState<"verify" | "app">(verifyHash ? "verify" : "app");
  const [notice, setNotice] = useState<"verified" | null>(null);

  const leaveVerify = (withNotice: boolean) => {
    history.replaceState(null, "", "/");
    setNotice(withNotice ? "verified" : null);
    setView("app");
  };

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
    return <AuthGate store={store} client={client} renderApp={renderApp} notice={notice} />;
  return <>{renderApp()}</>;
}
