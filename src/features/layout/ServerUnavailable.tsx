import { useState } from "react";
import { Btn } from "@/components/Btn";
import { LAYOUT_COPY } from "./copy";

const COPY = LAYOUT_COPY.serverUnavailable;

/** Full-page error shown when `/healthz` does not answer as the Node server. Never shows data (D44). */
export function ServerUnavailable({
  dev = false,
  onRetry,
}: {
  dev?: boolean;
  onRetry: () => Promise<void> | void;
}) {
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };
  return (
    <div className="app-shell">
      <main className="no-results" role="alert">
        <h3>{COPY.title}</h3>
        <p>{COPY.body}</p>
        {dev && <p>{COPY.devHint}</p>}
        <div>
          <Btn kind="primary" onClick={retry} disabled={retrying}>
            {retrying ? COPY.retrying : COPY.retry}
          </Btn>
        </div>
      </main>
    </div>
  );
}
