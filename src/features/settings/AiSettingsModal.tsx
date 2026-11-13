import { useCallback, useEffect, useState } from "react";

import { Btn } from "@/components/Btn";
import { Confirm } from "@/components/Confirm";
import { Field } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { AiSettingsError, type AiSettingsClient } from "@/data/aiSettings";
import { AI_PROVIDERS, type AiProvider, type AiSettingsView } from "@/shared/ai/catalog";
import { SETTINGS_COPY as COPY, aiErrorMessage } from "./copy";
import {
  canSave,
  canTest,
  initialForm,
  keyError,
  modelsFor,
  nextModelOnProviderChange,
  type SettingsForm,
} from "./form";

type Status = { kind: "ok" | "error"; text: string } | null;
type Load = "loading" | "ready" | { error: string; code: string };

const messageOf = (e: unknown) =>
  e instanceof AiSettingsError ? aiErrorMessage(e.code, e.requestId) : aiErrorMessage("internal");

export function AiSettingsModal({
  client,
  onClose,
}: {
  client: AiSettingsClient;
  onClose: () => void;
}) {
  const [load, setLoad] = useState<Load>("loading");
  const [saved, setSaved] = useState<AiSettingsView | null>(null);
  const [form, setForm] = useState<SettingsForm>(initialForm(null));
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchSettings = useCallback(() => {
    setLoad("loading");
    client.get().then(
      (view) => {
        setSaved(view);
        setForm(initialForm(view));
        setLoad("ready");
      },
      (e) =>
        setLoad({ error: messageOf(e), code: e instanceof AiSettingsError ? e.code : "internal" }),
    );
  }, [client]);
  useEffect(fetchSettings, [fetchSettings]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const fail = (e: unknown, prefix = "") =>
    setStatus({ kind: "error", text: prefix + messageOf(e) });

  const save = () =>
    run(async () => {
      try {
        const key = form.key.trim();
        const view = await client.save({
          provider: form.provider,
          model: form.model,
          ...(key && { apiKey: key }),
        });
        setSaved(view);
        setForm(initialForm(view));
        setStatus({ kind: "ok", text: COPY.saved });
      } catch (e) {
        fail(e);
      }
    });
  const test = () =>
    run(async () => {
      try {
        await client.test();
        setStatus({ kind: "ok", text: COPY.testOk });
      } catch (e) {
        fail(e, COPY.testFailed);
      }
    });
  const deleteKey = () =>
    run(async () => {
      try {
        const view = await client.deleteKey();
        setSaved(view);
        setForm(initialForm(view));
        setStatus({ kind: "ok", text: COPY.deleted });
      } catch (e) {
        fail(e);
      }
    });

  const err = keyError(form.key);
  const misconfigured = typeof load === "object" && load.code === "server_misconfigured";

  return (
    <Modal onClose={onClose}>
      <div className="modal-header">
        <div>
          <p className="eyebrow">{COPY.eyebrow}</p>
          <h2>{COPY.title}</h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label={COPY.close}>
          <Icon name="close" />
        </button>
      </div>
      <div className="ai-settings-body">
        {load === "loading" && <p>{COPY.loading}</p>}
        {typeof load === "object" && (
          <div role="alert" className="ai-settings-status ai-settings-error">
            <span>{load.error}</span>
            {!misconfigured && <Btn onClick={fetchSettings}>{COPY.retry}</Btn>}
          </div>
        )}
        {load === "ready" && (
          <>
            <Field label={COPY.provider}>
              <select
                value={form.provider}
                onChange={(e) => {
                  const provider = e.target.value as AiProvider;
                  setForm((f) => ({
                    ...f,
                    provider,
                    model: nextModelOnProviderChange(provider, f.model),
                  }));
                }}
              >
                {AI_PROVIDERS.map((p) => (
                  <option key={p} value={p} disabled={modelsFor(p).length === 0}>
                    {COPY.providerOptions[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={COPY.model}>
              <select
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              >
                {modelsFor(form.provider).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            {saved && !saved.modelSupported && (
              <p className="ai-settings-hint">{COPY.unsupportedModel}</p>
            )}
            <Field label={COPY.apiKey} error={err ? aiErrorMessage(err) : undefined}>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={form.key}
                placeholder={COPY.keyPlaceholder}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              />
            </Field>
            <p className="ai-settings-hint">
              {saved?.hasKey && saved.keyHint ? COPY.keySaved(saved.keyHint) : COPY.noKey}
            </p>
            {!canTest(form, saved) && saved?.hasKey && (
              <p className="ai-settings-hint">{COPY.saveFirst}</p>
            )}
            {status && (
              <div
                role={status.kind === "ok" ? "status" : "alert"}
                className={`ai-settings-status ${status.kind === "error" ? "ai-settings-error" : ""}`}
              >
                {status.text}
              </div>
            )}
          </>
        )}
      </div>
      {load === "ready" && (
        <div className="modal-footer">
          <Btn
            kind="danger"
            disabled={busy || !saved?.hasKey}
            onClick={() => setConfirmDelete(true)}
          >
            {COPY.deleteKey}
          </Btn>
          <div>
            <Btn disabled={busy || !canTest(form, saved)} onClick={test}>
              {COPY.test}
            </Btn>
            <Btn kind="primary" disabled={busy || !canSave(form, saved)} onClick={save}>
              {COPY.save}
            </Btn>
          </div>
        </div>
      )}
      {confirmDelete && (
        <Confirm
          title={COPY.confirmDelete.title}
          body={COPY.confirmDelete.body}
          confirmLabel={COPY.confirmDelete.confirm}
          cancelLabel={COPY.confirmDelete.cancel}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            void deleteKey();
          }}
        />
      )}
    </Modal>
  );
}
