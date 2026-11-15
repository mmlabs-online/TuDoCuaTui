import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VerifyEmailPage } from "./VerifyEmailPage";
import { AUTH_COPY } from "./copy";
import type { IdentityClient } from "./identityClient";
import type { AuthError } from "./types";

const TOKEN = "Zk3_-abcdefghijklmnopqrstuvwxyz0123456789ABC";
const HASH = `#token=${TOKEN}`;
const ID = "11111111-1111-4111-8111-111111111111";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(hash = HASH, accountId: string | null = null) {
  const client = {
    verifyEmail: vi.fn(async (_t: string) => {}),
    resendVerification: vi.fn(async (_id: string) => {}),
  };
  const onContinue = vi.fn();
  const onGoSignIn = vi.fn();
  const view = render(
    <VerifyEmailPage
      hash={hash}
      client={client as unknown as IdentityClient}
      accountId={accountId}
      onContinue={onContinue}
      onGoSignIn={onGoSignIn}
    />,
  );
  return { client, onContinue, onGoSignIn, view };
}
const press = async (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });

describe("VerifyEmailPage", () => {
  it("a bad hash -> invalid with no request", () => {
    const { client } = setup("#token=short");
    expect(screen.getByRole("alert").textContent).toContain(AUTH_COPY.errors.token_invalid);
    expect(client.verifyEmail).not.toHaveBeenCalled();
  });

  it("a good hash waits for the button: no POST before the click, one per click", async () => {
    const { client } = setup();
    expect(screen.getByRole("button", { name: AUTH_COPY.verify.submit })).toBeTruthy();
    expect(client.verifyEmail).not.toHaveBeenCalled();
    await press(AUTH_COPY.verify.submit);
    expect(client.verifyEmail).toHaveBeenCalledTimes(1);
    expect(client.verifyEmail).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText(AUTH_COPY.verify.verified)).toBeTruthy();
  });

  it("verified -> Tiếp tục calls onContinue", async () => {
    const { onContinue } = setup();
    await press(AUTH_COPY.verify.submit);
    await press(AUTH_COPY.verify.continue);
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it.each(["token_invalid", "validation_error"] as const)("422 %s -> invalid", async (code) => {
    const { client } = setup();
    client.verifyEmail.mockRejectedValueOnce({ code } as AuthError);
    await press(AUTH_COPY.verify.submit);
    expect(screen.getByRole("alert").textContent).toContain(AUTH_COPY.errors.token_invalid);
  });

  it("429 -> back to ready with the wait text, then a retry works", async () => {
    const { client } = setup();
    client.verifyEmail.mockRejectedValueOnce({ code: "rate_limited", retryAfterSeconds: 120 });
    await press(AUTH_COPY.verify.submit);
    expect(screen.getByRole("alert").textContent).toContain("2 phút");
    await press(AUTH_COPY.verify.submit);
    expect(client.verifyEmail).toHaveBeenCalledTimes(2);
    expect(screen.getByText(AUTH_COPY.verify.verified)).toBeTruthy();
  });

  it("network error -> ready with the network copy", async () => {
    const { client } = setup();
    client.verifyEmail.mockRejectedValueOnce({ code: "network" });
    await press(AUTH_COPY.verify.submit);
    expect(screen.getByRole("alert").textContent).toContain(AUTH_COPY.errors.network);
    expect(screen.getByRole("button", { name: AUTH_COPY.verify.submit })).toBeTruthy();
  });

  it("the token is never in the DOM and nothing is logged", async () => {
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => {}),
    );
    const { client, view } = setup();
    expect(view.container.innerHTML).not.toContain(TOKEN);
    client.verifyEmail.mockRejectedValueOnce({ code: "token_invalid" });
    await press(AUTH_COPY.verify.submit);
    expect(view.container.innerHTML).not.toContain(TOKEN);
    for (const l of logs) expect(l).not.toHaveBeenCalled();
  });

  describe("resend on an invalid link", () => {
    const invalid = async (accountId: string | null) => {
      const r = setup(HASH, accountId);
      r.client.verifyEmail.mockRejectedValueOnce({ code: "token_invalid" });
      await press(AUTH_COPY.verify.submit);
      return r;
    };

    it("is offered only with an account id", async () => {
      await invalid(null);
      expect(screen.queryByRole("button", { name: AUTH_COPY.actions.resend })).toBeNull();
      expect(screen.getByRole("button", { name: AUTH_COPY.verify.goSignIn })).toBeTruthy();
      cleanup();
      await invalid(ID);
      expect(screen.getByRole("button", { name: AUTH_COPY.actions.resend })).toBeTruthy();
    });

    it("202 -> sent", async () => {
      const { client } = await invalid(ID);
      await press(AUTH_COPY.actions.resend);
      expect(client.resendVerification).toHaveBeenCalledWith(ID);
      expect(screen.getByText(AUTH_COPY.actions.resendSent)).toBeTruthy();
    });

    it("409 email_already_verified -> verified", async () => {
      const { client } = await invalid(ID);
      client.resendVerification.mockRejectedValueOnce({ code: "email_already_verified" });
      await press(AUTH_COPY.actions.resend);
      expect(screen.getByText(AUTH_COPY.verify.verified)).toBeTruthy();
    });

    it("429 -> error under the button", async () => {
      const { client } = await invalid(ID);
      client.resendVerification.mockRejectedValueOnce({
        code: "rate_limited",
        retryAfterSeconds: 60,
      });
      await press(AUTH_COPY.actions.resend);
      expect(screen.getAllByRole("alert")[1].textContent).toContain("1 phút");
    });

    it("401 session_invalid -> falls back to the sign-in button", async () => {
      const { client } = await invalid(ID);
      client.resendVerification.mockRejectedValueOnce({ code: "session_invalid" });
      await press(AUTH_COPY.actions.resend);
      expect(screen.queryByRole("button", { name: AUTH_COPY.actions.resend })).toBeNull();
      expect(screen.getByRole("button", { name: AUTH_COPY.verify.goSignIn })).toBeTruthy();
    });
  });
});
