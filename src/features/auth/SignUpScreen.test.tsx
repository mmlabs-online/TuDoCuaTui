import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignUpScreen } from "./SignUpScreen";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { AuthError, SignUpScreenProps } from "./types";

afterEach(cleanup);

function describedBy(el: HTMLElement): string {
  return (el.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

function setup(props: Partial<SignUpScreenProps> = {}) {
  const onSignUp = vi.fn();
  const onGoSignIn = vi.fn();
  render(<SignUpScreen status="idle" onSignUp={onSignUp} onGoSignIn={onGoSignIn} {...props} />);
  return { onSignUp, onGoSignIn };
}

const f = AUTH_COPY.fields;
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signUp.submit }));
const fill = (email = "an@vi.vn", pw = "a".repeat(12), confirm = pw) => {
  type(f.email, email);
  type(f.password, pw);
  type(f.confirm, confirm);
};

describe("SignUpScreen validation", () => {
  it.each([
    ["bad email", () => fill("bad"), f.email, AUTH_COPY.fieldErrors.invalid],
    [
      "short password",
      () => fill("an@vi.vn", "a".repeat(11)),
      f.password,
      AUTH_COPY.fieldErrors.tooShort,
    ],
    [
      "mismatch",
      () => fill("an@vi.vn", "a".repeat(12), "b".repeat(12)),
      f.confirm,
      AUTH_COPY.fieldErrors.mismatch,
    ],
  ])("%s shows error, focuses field, no call", (_, act, label, message) => {
    const { onSignUp } = setup();
    act();
    submit();
    const field = screen.getByLabelText(label);
    expect(describedBy(field)).toContain(message);
    expect(document.activeElement).toBe(field);
    expect(onSignUp).not.toHaveBeenCalled();
  });

  it("valid submit omits the confirm value", () => {
    const { onSignUp } = setup();
    fill(" an@vi.vn ");
    submit();
    expect(onSignUp).toHaveBeenCalledWith({ email: "an@vi.vn", password: "a".repeat(12) });
  });

  it("turnstileReady=false disables submit; slot is before submit", () => {
    setup({ turnstileReady: false, turnstileSlot: <span>slot-content</span> });
    const btn = screen.getByRole("button", { name: AUTH_COPY.signUp.submit });
    expect(btn as HTMLButtonElement).toHaveProperty("disabled", true);
    const slot = screen.getByText("slot-content");
    expect(slot.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("password inputs use new-password", () => {
    setup();
    expect(screen.getByLabelText(f.password).getAttribute("autocomplete")).toBe("new-password");
    expect(screen.getByLabelText(f.confirm).getAttribute("autocomplete")).toBe("new-password");
  });

  it("status=submitting disables submit", () => {
    setup({ status: "submitting" });
    expect(
      screen.getByRole("button", { name: AUTH_COPY.signUp.submitting }) as HTMLButtonElement,
    ).toHaveProperty("disabled", true);
  });
});

describe("SignUpScreen errors", () => {
  it("email_taken has a sign-in action", () => {
    const { onGoSignIn } = setup({ error: { code: "email_taken" } });
    expect(screen.getByRole("alert").textContent).toContain(AUTH_COPY.errors.email_taken);
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.actions.goSignIn }));
    expect(onGoSignIn).toHaveBeenCalledOnce();
  });

  it.each<AuthError>([
    { code: "weak_password", reasons: ["too_common"] },
    { code: "turnstile_failed" },
    { code: "rate_limited", retryAfterSeconds: 60 },
    { code: "network" },
    { code: "validation_error" },
  ])("renders $code", (error) => {
    setup({ error });
    expect(screen.getByRole("alert").textContent).toContain(authErrorMessage(error));
  });
});

describe("SignUpScreen sent state", () => {
  it("shows the confirmation and no form", () => {
    const { onGoSignIn } = setup({ status: "sent", sentTo: "an@vi.vn" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      AUTH_COPY.signUp.sentTitle,
    );
    expect(screen.getByRole("status").textContent).toContain("an@vi.vn");
    expect(screen.getByRole("status").textContent).toContain(AUTH_COPY.signUp.sentNote);
    expect(document.querySelector("form")).toBeNull();
    expect(screen.queryByRole("button", { name: AUTH_COPY.actions.resend })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.actions.goSignIn }));
    expect(onGoSignIn).toHaveBeenCalledOnce();
  });

  it("resend button only with onResend", () => {
    const onResend = vi.fn();
    setup({ status: "sent", sentTo: "an@vi.vn", onResend });
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.actions.resend }));
    expect(onResend).toHaveBeenCalledOnce();
  });

  it("resend sent and error notices", () => {
    setup({
      status: "sent",
      onResend: vi.fn(),
      resend: { status: "sent", error: { code: "rate_limited", retryAfterSeconds: 60 } },
    });
    expect(screen.getByText(AUTH_COPY.actions.resendSent)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("1 phút");
    expect(screen.queryByRole("button", { name: AUTH_COPY.actions.resend })).toBeNull();
  });
});
