import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordScreen } from "./ForgotPasswordScreen";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { AuthError, ForgotPasswordScreenProps } from "./types";

afterEach(cleanup);

function setup(props: Partial<ForgotPasswordScreenProps> = {}) {
  const onSubmit = vi.fn();
  const onGoSignIn = vi.fn();
  render(
    <ForgotPasswordScreen status="idle" onSubmit={onSubmit} onGoSignIn={onGoSignIn} {...props} />,
  );
  return { onSubmit, onGoSignIn };
}
const type = (value: string) =>
  fireEvent.change(screen.getByLabelText(AUTH_COPY.fields.email), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.forgot.submit }));

describe("ForgotPasswordScreen", () => {
  it.each(["", "bad"])("email %j shows the field error, focuses email, no onSubmit", (v) => {
    const { onSubmit } = setup();
    type(v);
    submit();
    const email = screen.getByLabelText(AUTH_COPY.fields.email);
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(email);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("valid submit calls onSubmit once with the trimmed email", () => {
    const { onSubmit } = setup();
    type("  an@vi.vn ");
    submit();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith("an@vi.vn");
  });

  it("submitting disables submit and a second submit does nothing", () => {
    const { onSubmit } = setup({ status: "submitting", initialEmail: "an@vi.vn" });
    const btn = screen.getByRole("button", { name: AUTH_COPY.forgot.submitting });
    expect(btn as HTMLButtonElement).toHaveProperty("disabled", true);
    fireEvent.submit(btn.closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("turnstileReady=false disables submit; the slot renders before submit", () => {
    const { onSubmit } = setup({
      turnstileReady: false,
      initialEmail: "an@vi.vn",
      turnstileSlot: <span>slot-content</span>,
    });
    const btn = screen.getByRole("button", { name: AUTH_COPY.forgot.submit });
    expect(btn as HTMLButtonElement).toHaveProperty("disabled", true);
    fireEvent.submit(btn.closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
    const slot = screen.getByText("slot-content");
    expect(slot.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each<AuthError>([
    { code: "turnstile_failed" },
    { code: "validation_error" },
    { code: "rate_limited", retryAfterSeconds: 120 },
    { code: "network" },
    { code: "unknown" },
  ])("renders error $code in role=alert", (error) => {
    setup({ error });
    expect(screen.getByRole("alert").textContent).toContain(authErrorMessage(error));
    if (error.code === "rate_limited")
      expect(screen.getByRole("alert").textContent).toContain("2 phút");
  });

  it("form is post, noValidate, email field has type and autocomplete", () => {
    setup();
    const form = document.querySelector("form")!;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.noValidate).toBe(true);
    const email = screen.getByLabelText(AUTH_COPY.fields.email);
    expect(email.getAttribute("type")).toBe("email");
    expect(email.getAttribute("autocomplete")).toBe("email");
  });

  it("sent state has fixed copy, no form, and the sign-in link works", () => {
    const { onGoSignIn } = setup({ status: "sent", initialEmail: "an@vi.vn" });
    expect(screen.getByRole("heading", { name: AUTH_COPY.forgot.sentTitle })).toBeTruthy();
    const text = screen.getByRole("status").textContent;
    expect(text).toContain(AUTH_COPY.forgot.sentBody);
    expect(text).toContain(AUTH_COPY.forgot.sentNote);
    expect(document.body.textContent).not.toContain("an@vi.vn");
    expect(document.querySelector("form")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.forgot.toSignIn }));
    expect(onGoSignIn).toHaveBeenCalledOnce();
  });
});
