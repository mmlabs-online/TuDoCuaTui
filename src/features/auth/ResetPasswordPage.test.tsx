import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { IdentityClient } from "./identityClient";
import type { AuthError } from "./types";

const TOKEN = "Zk3_-abcdefghijklmnopqrstuvwxyz0123456789ABC";
const HASH = `#token=${TOKEN}`;
const PASSWORD = "correct horse battery";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(hash = HASH) {
  const client = { resetPassword: vi.fn(async (_v: unknown) => {}) };
  const onContinue = vi.fn();
  const onRequestNew = vi.fn();
  const view = render(
    <ResetPasswordPage
      hash={hash}
      client={client as unknown as IdentityClient}
      onContinue={onContinue}
      onRequestNew={onRequestNew}
    />,
  );
  return { client, onContinue, onRequestNew, view };
}
const fill = (password = PASSWORD) => {
  fireEvent.change(screen.getByLabelText(AUTH_COPY.fields.newPassword), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText(AUTH_COPY.fields.confirm), {
    target: { value: password },
  });
};
const press = async () =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.reset.submit }));
  });
const noToken = () => expect(document.body.innerHTML).not.toContain(TOKEN);

describe("ResetPasswordPage", () => {
  it("a bad hash -> invalid with no request", () => {
    const { client } = setup("#token=short");
    expect(screen.getByRole("alert").textContent).toContain(AUTH_COPY.reset.invalid);
    expect(client.resetPassword).not.toHaveBeenCalled();
  });

  it("no request on mount; submit sends one resetPassword({token, newPassword})", async () => {
    const { client } = setup();
    expect(client.resetPassword).not.toHaveBeenCalled();
    fill();
    await press();
    expect(client.resetPassword).toHaveBeenCalledOnce();
    expect(client.resetPassword).toHaveBeenCalledWith({ token: TOKEN, newPassword: PASSWORD });
  });

  it("a double submit while pending sends one request", async () => {
    const { client } = setup();
    client.resetPassword.mockReturnValueOnce(new Promise<void>(() => {}));
    fill();
    await press();
    const form = document.querySelector("form")!;
    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(client.resetPassword).toHaveBeenCalledOnce();
  });

  it("204 -> done; Tiếp tục calls onContinue", async () => {
    const { onContinue } = setup();
    fill();
    await press();
    expect(screen.getByRole("status").textContent).toContain(AUTH_COPY.reset.done);
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.reset.continue }));
    expect(onContinue).toHaveBeenCalledOnce();
    noToken();
  });

  it("weak_password -> ready with reasons; a retry sends the same token again", async () => {
    const { client } = setup();
    const weak: AuthError = { code: "weak_password", reasons: ["too_common"] };
    client.resetPassword.mockRejectedValueOnce(weak);
    fill();
    await press();
    expect(screen.getByRole("alert").textContent).toContain(authErrorMessage(weak));
    fill("another horse battery");
    await press();
    expect(client.resetPassword).toHaveBeenCalledTimes(2);
    expect((client.resetPassword.mock.calls[1][0] as { token: string }).token).toBe(TOKEN);
  });

  it.each(["token_invalid", "validation_error"] as const)(
    "%s -> invalid with Gửi link mới",
    async (code) => {
      const { client, onRequestNew } = setup();
      client.resetPassword.mockRejectedValueOnce({ code });
      fill();
      await press();
      expect(screen.getByRole("alert").textContent).toContain(AUTH_COPY.reset.invalid);
      fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.reset.requestNew }));
      expect(onRequestNew).toHaveBeenCalledOnce();
      noToken();
    },
  );

  it.each<AuthError>([
    { code: "rate_limited", retryAfterSeconds: 60 },
    { code: "network" },
    { code: "unknown" },
  ])("$code -> ready with the error", async (error) => {
    const { client } = setup();
    client.resetPassword.mockRejectedValueOnce(error);
    fill();
    await press();
    expect(screen.getByRole("alert").textContent).toContain(authErrorMessage(error));
    expect(screen.getByRole("button", { name: AUTH_COPY.reset.submit })).toBeTruthy();
  });

  it("the token never appears in the DOM and nothing is logged, in any state", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const { client } = setup();
    noToken();
    client.resetPassword.mockRejectedValueOnce({ code: "network" });
    fill();
    await press();
    noToken();
    fill();
    await press();
    noToken();
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
