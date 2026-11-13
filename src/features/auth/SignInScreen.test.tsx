import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignInScreen } from "./SignInScreen";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { AuthError, AuthErrorCode, SignInScreenProps } from "./types";

afterEach(cleanup);

function describedBy(el: HTMLElement): string {
  return (el.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

function setup(props: Partial<SignInScreenProps> = {}) {
  const onSignIn = vi.fn();
  const onGoSignUp = vi.fn();
  render(<SignInScreen status="idle" onSignIn={onSignIn} onGoSignUp={onGoSignUp} {...props} />);
  return { onSignIn, onGoSignUp };
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("SignInScreen", () => {
  it("empty submit shows errors, focuses email, does not call onSignIn", () => {
    const { onSignIn } = setup();
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signIn.submit }));
    const email = screen.getByLabelText(AUTH_COPY.fields.email);
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy(email)).toContain(AUTH_COPY.fieldErrors.required);
    expect(screen.getByLabelText(AUTH_COPY.fields.password).getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(document.activeElement).toBe(email);
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it("valid submit passes trimmed email and untouched password once", () => {
    const { onSignIn } = setup();
    type(AUTH_COPY.fields.email, "  an@vi.vn ");
    type(AUTH_COPY.fields.password, " pass word ");
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signIn.submit }));
    expect(onSignIn).toHaveBeenCalledOnce();
    expect(onSignIn).toHaveBeenCalledWith({ email: "an@vi.vn", password: " pass word " });
  });

  it("submitting disables submit and never calls again", () => {
    const { onSignIn } = setup({ status: "submitting", initialEmail: "an@vi.vn" });
    const btn = screen.getByRole("button", { name: AUTH_COPY.signIn.submitting });
    expect(btn as HTMLButtonElement).toHaveProperty("disabled", true);
    type(AUTH_COPY.fields.password, "x");
    fireEvent.submit(btn.closest("form")!);
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it.each<AuthError>([
    { code: "invalid_credentials" },
    { code: "email_unverified" },
    { code: "not_member" },
    { code: "session_invalid" },
    { code: "turnstile_required" },
    { code: "turnstile_failed" },
    { code: "rate_limited", retryAfterSeconds: 120 },
    { code: "network" },
    { code: "unknown" },
  ])("renders error $code", (error) => {
    setup({ error });
    expect(screen.getByRole("alert").textContent).toContain(authErrorMessage(error));
    if (error.code === "rate_limited")
      expect(screen.getByRole("alert").textContent).toContain("2 phút");
  });

  it("email_unverified offers resend only when onResend is given", () => {
    const error = { code: "email_unverified" as AuthErrorCode };
    const { unmount } = render(
      <SignInScreen status="idle" error={error} onSignIn={vi.fn()} onGoSignUp={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: AUTH_COPY.actions.resend })).toBeNull();
    unmount();
    const onResend = vi.fn();
    const view = render(
      <SignInScreen
        status="idle"
        error={error}
        onResend={onResend}
        onSignIn={vi.fn()}
        onGoSignUp={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.actions.resend }));
    expect(onResend).toHaveBeenCalledOnce();
    view.rerender(
      <SignInScreen
        status="idle"
        error={error}
        onResend={onResend}
        resend={{ status: "sent" }}
        onSignIn={vi.fn()}
        onGoSignUp={vi.fn()}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(AUTH_COPY.actions.resendSent);
  });

  it("turnstile slot only with turnstile errors", () => {
    const slot = <span>slot-content</span>;
    const { unmount } = render(
      <SignInScreen
        status="idle"
        error={{ code: "invalid_credentials" }}
        turnstileSlot={slot}
        onSignIn={vi.fn()}
        onGoSignUp={vi.fn()}
      />,
    );
    expect(screen.queryByText("slot-content")).toBeNull();
    unmount();
    render(
      <SignInScreen
        status="idle"
        error={{ code: "turnstile_required" }}
        turnstileSlot={slot}
        onSignIn={vi.fn()}
        onGoSignUp={vi.fn()}
      />,
    );
    expect(screen.getByText("slot-content")).toBeTruthy();
  });

  it("verified notice and sign-up link", () => {
    const { onGoSignUp } = setup({ notice: "verified" });
    expect(screen.getByRole("status").textContent).toContain(AUTH_COPY.signIn.verified);
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signIn.toSignUp }));
    expect(onGoSignUp).toHaveBeenCalledOnce();
  });

  it("form attributes and order", () => {
    setup();
    const email = screen.getByLabelText(AUTH_COPY.fields.email);
    const password = screen.getByLabelText(AUTH_COPY.fields.password);
    const form = email.closest("form")!;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.hasAttribute("novalidate")).toBe(true);
    expect(email.getAttribute("type")).toBe("email");
    expect(email.getAttribute("autocomplete")).toBe("email");
    expect(password.getAttribute("type")).toBe("password");
    expect(password.getAttribute("autocomplete")).toBe("current-password");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const order = Array.from(document.querySelectorAll("input, button"));
    expect(order).toEqual([
      email,
      password,
      screen.getByRole("button", { name: AUTH_COPY.signIn.submit }),
      screen.getByRole("button", { name: AUTH_COPY.signIn.toSignUp }),
    ]);
  });
});
