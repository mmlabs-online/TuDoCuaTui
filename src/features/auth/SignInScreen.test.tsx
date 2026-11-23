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

  it("show password toggles the field between hidden and visible", () => {
    setup();
    const field = screen.getByLabelText(AUTH_COPY.fields.password);
    expect(field.getAttribute("type")).toBe("password");
    fireEvent.click(screen.getByLabelText(AUTH_COPY.fields.showPassword));
    expect(field.getAttribute("type")).toBe("text");
    fireEvent.click(screen.getByLabelText(AUTH_COPY.fields.showPassword));
    expect(field.getAttribute("type")).toBe("password");
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
      screen.getByLabelText(AUTH_COPY.fields.showPassword),
      screen.getByRole("button", { name: AUTH_COPY.signIn.submit }),
      screen.getByRole("button", { name: AUTH_COPY.signIn.toSignUp }),
    ]);
  });
});

describe("SignInScreen forgot password", () => {
  it("Quên mật khẩu? only with onGoForgot, and click calls it", () => {
    const { unmount } = render(
      <SignInScreen status="idle" onSignIn={vi.fn()} onGoSignUp={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: AUTH_COPY.signIn.forgot })).toBeNull();
    unmount();
    const onGoForgot = vi.fn();
    render(
      <SignInScreen
        status="idle"
        onSignIn={vi.fn()}
        onGoSignUp={vi.fn()}
        onGoForgot={onGoForgot}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signIn.forgot }));
    expect(onGoForgot).toHaveBeenCalledOnce();
  });

  it("notice=logout_unconfirmed shows its copy in role=status", () => {
    setup({ notice: "logout_unconfirmed" });
    expect(screen.getByRole("status").textContent).toContain(AUTH_COPY.signIn.logoutUnconfirmed);
  });

  it("logout_unconfirmed with onRetrySignOut shows Thử đăng xuất lại; retrying shows Đang đăng xuất… disabled", () => {
    const onRetrySignOut = vi.fn();
    setup({ notice: "logout_unconfirmed", onRetrySignOut });
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signIn.retrySignOut }));
    expect(onRetrySignOut).toHaveBeenCalledOnce();
    cleanup();
    setup({ notice: "logout_unconfirmed", onRetrySignOut, retryingSignOut: true });
    const busy = screen.getByRole("button", { name: AUTH_COPY.signIn.retryingSignOut });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
  });

  it("no retry button without onRetrySignOut or with another notice", () => {
    setup({ notice: "logout_unconfirmed" });
    expect(screen.queryByRole("button", { name: AUTH_COPY.signIn.retrySignOut })).toBeNull();
    cleanup();
    setup({ notice: "signed_out", onRetrySignOut: vi.fn() });
    expect(screen.queryByRole("button", { name: AUTH_COPY.signIn.retrySignOut })).toBeNull();
  });

  it("notice=password_reset shows its copy in role=status", () => {
    setup({ notice: "password_reset" });
    expect(screen.getByRole("status").textContent).toContain(AUTH_COPY.signIn.passwordReset);
  });
});

describe("SignInScreen continue-as list", () => {
  const A = { accountId: "00000000-0000-4000-8000-000000000001", email: "an@example.com" };
  const B = { accountId: "00000000-0000-4000-8000-000000000002", email: "binh@example.com" };
  const label = (a: { email: string }) => AUTH_COPY.signIn.continueAs(a.email);

  it("one button per account labelled Tiếp tục với {email}; a click calls onContinueAs with that account; the first is primary", () => {
    const onContinueAs = vi.fn();
    setup({ accounts: [A, B], onContinueAs });
    const first = screen.getByRole("button", { name: label(A) });
    const second = screen.getByRole("button", { name: label(B) });
    expect(first.className).toContain("btn-primary");
    expect(second.className).not.toContain("btn-primary");
    fireEvent.click(second);
    expect(onContinueAs).toHaveBeenCalledOnce();
    expect(onContinueAs).toHaveBeenCalledWith(B);
  });

  it("no list and no divider when accounts is empty or undefined; the form is still there", () => {
    for (const accounts of [undefined, []]) {
      setup({ accounts, onContinueAs: vi.fn() });
      expect(screen.queryByText(AUTH_COPY.signIn.otherAccount)).toBeNull();
      expect(screen.queryByRole("region", { name: AUTH_COPY.signIn.accountsLabel })).toBeNull();
      expect(screen.getByLabelText(AUTH_COPY.fields.email)).toBeTruthy();
      cleanup();
    }
  });

  it("the divider sits between the list and the form; the list has the accessible name accountsLabel", () => {
    setup({ accounts: [A], onContinueAs: vi.fn() });
    const list = screen.getByRole("region", { name: AUTH_COPY.signIn.accountsLabel });
    const divider = screen.getByText(AUTH_COPY.signIn.otherAccount);
    const form = document.querySelector("form") as HTMLElement;
    expect(list.contains(screen.getByRole("button", { name: label(A) }))).toBe(true);
    expect(list.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(divider.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText(AUTH_COPY.fields.email)).toBeTruthy();
  });

  it("submitting disables the list buttons and the form submit; the chosen button shows continuing", () => {
    setup({
      accounts: [A, B],
      onContinueAs: vi.fn(),
      status: "submitting",
      continuingId: A.accountId,
    });
    // the chosen list button and the form submit both read "Đang đăng nhập…"
    const busy = screen.getAllByRole("button", { name: AUTH_COPY.signIn.continuing });
    expect(busy).toHaveLength(2);
    expect(screen.queryByRole("button", { name: label(A) })).toBeNull();
    for (const b of [...busy, screen.getByRole("button", { name: label(B) })]) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("a long email label carries break-all", () => {
    const long = {
      accountId: A.accountId,
      email: "nguyen.thi.thu.trang.dangky.taikhoan.moi.2026@example.com",
    };
    setup({ accounts: [long], onContinueAs: vi.fn() });
    const text = screen.getByText(label(long));
    expect(text.className).toContain("whitespace-normal");
    expect(text.className).toContain("break-all");
  });
});
