// The app's own dialogs in place of the browser's alert() and confirm():
// `await ask(...)` resolves with the value of the button chosen, and with
// `cancel` when the dialog is dismissed (Escape, a click beside it).
import { create } from "zustand";

export interface DialogAction {
  label: string;
  value: string;
  style?: "primary" | "danger" | "plain";
}

export interface DialogRequest {
  title: string;
  message: string;
  actions: DialogAction[];
  cancel: string;
}

interface Pending extends DialogRequest {
  resolve: (value: string) => void;
}

interface DialogState {
  queue: Pending[];
  close: (value: string) => void;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  queue: [],
  close: (value) => {
    const [first, ...rest] = get().queue;
    if (!first) return;
    set({ queue: rest });
    first.resolve(value);
  },
}));

export function ask(request: DialogRequest): Promise<string> {
  return new Promise((resolve) => {
    useDialogStore.setState((s) => ({ queue: [...s.queue, { ...request, resolve }] }));
  });
}

/** A message with one OK button. */
export async function tell(title: string, message: string): Promise<void> {
  await ask({ title, message, actions: [{ label: "OK", value: "ok", style: "primary" }], cancel: "ok" });
}

/** A yes/no question; true when confirmed. */
export async function confirmAction(
  title: string, message: string, confirmLabel: string, style: "primary" | "danger" = "primary",
): Promise<boolean> {
  const answer = await ask({
    title, message, cancel: "cancel",
    actions: [{ label: "Cancel", value: "cancel" }, { label: confirmLabel, value: "yes", style }],
  });
  return answer === "yes";
}
