import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnverifiedScreen } from "./UnverifiedScreen";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { UnverifiedScreenProps } from "./types";

afterEach(cleanup);

function setup(props: Partial<UnverifiedScreenProps> = {}) {
  const fns = { onResend: vi.fn(), onCheckAgain: vi.fn(), onUseOtherAccount: vi.fn() };
  render(
    <UnverifiedScreen email="an@example.com" resend={{ status: "idle" }} {...fns} {...props} />,
  );
  return fns;
}

describe("UnverifiedScreen", () => {
  it("shows the title and the body with the email; without an email the generic body", () => {
    setup();
    expect(screen.getByRole("heading", { name: AUTH_COPY.unverified.title })).toBeTruthy();
    expect(screen.getByText(AUTH_COPY.unverified.body("an@example.com"))).toBeTruthy();
    cleanup();
    setup({ email: null });
    expect(screen.getByText(AUTH_COPY.unverified.body(null))).toBeTruthy();
  });

  it("resend: idle -> click calls onResend; sending disables it; sent shows resendSent and hides the button; an error shows its copy", () => {
    const f = setup();
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.actions.resend }));
    expect(f.onResend).toHaveBeenCalledOnce();
    cleanup();
    setup({ resend: { status: "sending" } });
    expect(
      (screen.getByRole("button", { name: AUTH_COPY.actions.resending }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    cleanup();
    setup({ resend: { status: "sent" } });
    expect(screen.getByText(AUTH_COPY.actions.resendSent)).toBeTruthy();
    expect(screen.queryByRole("button", { name: AUTH_COPY.actions.resend })).toBeNull();
    cleanup();
    setup({ resend: { status: "idle", error: { code: "network" } } });
    expect(screen.getByRole("alert").textContent).toContain(authErrorMessage({ code: "network" }));
  });

  it("Tôi đã xác minh email calls onCheckAgain; Dùng tài khoản khác calls onUseOtherAccount; still shows the email_unverified error", () => {
    const f = setup({ still: true });
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.unverified.checkAgain }));
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.unverified.otherAccount }));
    expect(f.onCheckAgain).toHaveBeenCalledOnce();
    expect(f.onUseOtherAccount).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert").textContent).toContain(AUTH_COPY.errors.email_unverified);
    cleanup();
    setup();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an email with markup is rendered as text", () => {
    const evil = "<img src=x onerror=alert(1)>@b.co";
    setup({ email: evil });
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(AUTH_COPY.unverified.body(evil))).toBeTruthy();
  });
});
