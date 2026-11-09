import { useState } from "react";

import { Icon } from "@/components/Icon";

export function useToast() {
  const [toast, setToast] = useState("");
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 2400);
  };
  return { toast, notify };
}

export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="toast">
      <span>
        <Icon name="check" size={15} />
      </span>
      {message}
    </div>
  );
}
