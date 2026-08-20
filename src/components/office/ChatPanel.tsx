import { useEffect, useRef, useState } from "react";
import { DESK_META } from "@/lib/office-api";
import { ORDER_SUGGESTIONS, type ChatEntry } from "@/lib/office-scene";

export function ChatPanel({
  chat,
  onDispatch,
  isMock,
}: {
  chat: ChatEntry[];
  onDispatch: (text: string) => void;
  isMock: boolean;
}) {
  const [value, setValue] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat]);
  useEffect(() => {
    input.current?.focus();
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    onDispatch(value);
    setValue("");
    input.current?.focus();
  };

  return (
    <aside className="pixel-border font-mono flex h-full min-h-0 flex-col rounded-sm bg-card">
      <header className="flex items-center justify-between border-b border-border px-3 py-3">
        <h2 className="pixel-font text-[9px] text-primary">OFFICE ORDERS</h2>
        <span
          className="pixel-font rounded-sm px-1 py-[3px] text-[6px]"
          style={{
            background: isMock ? "var(--muted)" : "var(--state-done)",
            color: isMock ? "var(--muted-foreground)" : "var(--primary-foreground)",
          }}
        >
          {isMock ? "SIM" : "LIVE"}
        </span>
      </header>

      <div
        ref={scroller}
        className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
      >
        {chat.length === 0 && (
          <div className="space-y-3 pt-2 text-muted-foreground">
            <p className="text-[17px] leading-snug">
              You are the Head. Type an order — it routes to the desks whose expertise matches.
            </p>
            <div className="space-y-2">
              {ORDER_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => onDispatch(s)}
                  className="block w-full rounded-sm border border-border px-2 py-2 text-left text-[16px] leading-snug transition-colors hover:border-primary hover:text-primary"
                >
                  &ldquo;{s}&rdquo;
                </button>
              ))}
            </div>
          </div>
        )}

        {chat.map((c) => (
          <div key={c.id} className="space-y-1">
            <div
              className="ml-auto w-fit max-w-[92%] break-words rounded-sm px-2 py-1 text-[17px] leading-snug"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              {c.order}
            </div>
            <div className="flex flex-wrap items-center gap-1 text-[16px] text-muted-foreground">
              <span>→ delivered to</span>
              {c.deskIds.map((id) => {
                const meta = DESK_META.find((m) => m.id === id);
                return (
                  <span key={id} className="pixel-font text-[6px]" style={{ color: meta?.color }}>
                    {meta?.name ?? id}
                  </span>
                );
              })}
              <span style={{ color: c.resolved ? "var(--state-done)" : "var(--primary)" }}>
                — {c.resolved ? "done" : "working…"}
              </span>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="border-t border-border p-3">
        <div className="flex gap-2">
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Head's Orders..."
            className="min-w-0 flex-1 rounded-sm border-2 border-border bg-input px-2 py-2 text-[18px] outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <button
            type="submit"
            className="pixel-font rounded-sm px-3 text-[7px] transition-transform active:translate-y-[2px]"
            style={{
              background: "var(--primary)",
              color: "var(--primary-foreground)",
              boxShadow: "0 3px 0 0 oklch(0.45 0.14 52)",
            }}
          >
            DISPATCH
          </button>
        </div>
      </form>
    </aside>
  );
}
