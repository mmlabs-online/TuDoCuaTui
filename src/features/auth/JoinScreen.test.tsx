import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JoinScreen } from "./JoinScreen";
import { AUTH_COPY, authErrorMessage } from "./copy";
import { PHOTO_PRIVACY_NOTICE } from "@/constants/privacy";
import type { JoinScreenProps } from "./types";

afterEach(cleanup);

function setup(props: Partial<JoinScreenProps> = {}) {
  const onJoin = vi.fn();
  const onUseOtherAccount = vi.fn();
  render(
    <JoinScreen
      email="an@example.com"
      status="idle"
      onJoin={onJoin}
      onUseOtherAccount={onUseOtherAccount}
      {...props}
    />,
  );
  return { onJoin, onUseOtherAccount };
}

describe("JoinScreen", () => {
  it("shows Tiếp tục với <email>; click calls onJoin once", () => {
    const { onJoin } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục với an@example.com" }));
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it("privacy notice is rendered and precedes the continue button in DOM order", () => {
    setup();
    const notice = screen.getByText(PHOTO_PRIVACY_NOTICE);
    const button = screen.getByRole("button", { name: /Tiếp tục với/ });
    expect(AUTH_COPY.join.privacy).toBe(PHOTO_PRIVACY_NOTICE);
    expect(notice.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("submitting disables the button and shows the joining label", () => {
    setup({ status: "submitting" });
    const button = screen.getByRole("button", {
      name: AUTH_COPY.join.joining,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("error notice uses authErrorMessage; other-account link calls onUseOtherAccount", () => {
    const { onUseOtherAccount } = setup({ error: { code: "join_closed" } });
    expect(screen.getByRole("alert").textContent).toBe(authErrorMessage({ code: "join_closed" }));
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.join.otherAccount }));
    expect(onUseOtherAccount).toHaveBeenCalledTimes(1);
  });

  it("an email with markup is rendered as text", () => {
    setup({ email: "<b>x</b>@a.co" });
    expect(document.querySelector("b")).toBeNull();
    expect(screen.getByRole("button", { name: "Tiếp tục với <b>x</b>@a.co" })).toBeTruthy();
  });
});
