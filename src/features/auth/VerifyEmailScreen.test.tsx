import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VerifyEmailScreen } from "./VerifyEmailScreen";
import { AUTH_COPY } from "./copy";
import type { VerifyEmailScreenProps } from "./types";

afterEach(cleanup);

function setup(props: Partial<VerifyEmailScreenProps> & Pick<VerifyEmailScreenProps, "state">) {
  const onContinue = vi.fn();
  const onGoSignIn = vi.fn();
  render(<VerifyEmailScreen onContinue={onContinue} onGoSignIn={onGoSignIn} {...props} />);
  return { onContinue, onGoSignIn };
}

describe("VerifyEmailScreen", () => {
  it("verifying is a busy status with no buttons", () => {
    setup({ state: "verifying" });
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toContain(AUTH_COPY.verify.verifying);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("verified shows success and continue", () => {
    const { onContinue } = setup({ state: "verified" });
    expect(screen.getByRole("status").textContent).toContain(AUTH_COPY.verify.verified);
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.verify.continue }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("invalid without onResend offers sign-in", () => {
    const { onGoSignIn } = setup({ state: "invalid" });
    expect(screen.getByRole("alert").textContent).toContain(AUTH_COPY.errors.token_invalid);
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.verify.goSignIn }));
    expect(onGoSignIn).toHaveBeenCalledOnce();
  });

  it("invalid with onResend offers resend", () => {
    const onResend = vi.fn();
    setup({ state: "invalid", onResend });
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.actions.resend }));
    expect(onResend).toHaveBeenCalledOnce();
  });

  it("resend sending disables the button", () => {
    setup({ state: "invalid", onResend: vi.fn(), resend: { status: "sending" } });
    expect(
      screen.getByRole("button", { name: AUTH_COPY.actions.resending }) as HTMLButtonElement,
    ).toHaveProperty("disabled", true);
  });

  it("resend sent shows the notice", () => {
    setup({ state: "invalid", onResend: vi.fn(), resend: { status: "sent" } });
    expect(screen.getByRole("status").textContent).toContain(AUTH_COPY.actions.resendSent);
  });

  it.each([
    [{ code: "rate_limited", retryAfterSeconds: 60 } as const, "1 phút"],
    [{ code: "session_invalid" } as const, AUTH_COPY.errors.session_invalid],
    [{ code: "email_already_verified" } as const, AUTH_COPY.errors.email_already_verified],
  ])("resend error %o", (error, text) => {
    setup({ state: "invalid", onResend: vi.fn(), resend: { status: "idle", error } });
    expect(screen.getAllByRole("alert")[1].textContent).toContain(text);
  });

  it("rate_limited shows the wait", () => {
    setup({ state: "rate_limited", retryAfterSeconds: 45 });
    expect(screen.getByRole("alert").textContent).toContain("45 giây");
  });
});
