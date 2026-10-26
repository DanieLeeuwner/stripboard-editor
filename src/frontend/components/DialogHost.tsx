"use client";

import { useEffect } from "react";
import { useDialogStore } from "@/lib/dialog";

const styles = {
  primary: "bg-[#113768] text-white font-medium hover:bg-[#0d2a50]",
  danger: "bg-red-500 dark:bg-red-600 text-white font-medium hover:bg-red-600",
  plain: "border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800",
};

/** Shows the dialogs asked for with ask() / tell(), one at a time. Mounted once in the root layout. */
export default function DialogHost() {
  const current = useDialogStore((s) => s.queue[0]);
  const close = useDialogStore((s) => s.close);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(current.cancel);
      }
    };
    // Capture, so an Escape meant for this dialog does not also close one below it
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [current, close]);

  if (!current) return null;
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[100] font-sans" onClick={() => close(current.cancel)}>
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-300 dark:border-neutral-600 shadow-xl dark:shadow-neutral-900/50 p-6 w-[calc(100%-2rem)] sm:w-[26rem] max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">{current.title}</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-5 whitespace-pre-line">{current.message}</p>
        <div className="flex flex-wrap gap-2 justify-end">
          {current.actions.map((a, i) => (
            <button
              key={a.value}
              autoFocus={i === current.actions.length - 1}
              onClick={() => close(a.value)}
              className={`px-4 py-2 text-sm rounded transition-colors ${styles[a.style ?? "plain"]}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
