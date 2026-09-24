import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DESK_META, officeApi, type MeetingMessage } from "@/lib/office-api";
import { DESK_VISUALS, type DeskId } from "@/lib/office-scene";

export function PrivateMeetingDialog({
  agentId,
  arriving,
  onClose,
}: {
  agentId: DeskId;
  arriving: boolean;
  onClose: () => void;
}) {
  const meta = DESK_META.find((m) => m.id === agentId)!;
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState("");
  const pending = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => bottom.current?.scrollIntoView({ block: "nearest" }), [messages, thinking]);

  async function send() {
    const text = prompt.trim();
    if (!text || pending.current || arriving) return;
    const controller = new AbortController();
    pending.current = controller;
    setThinking(true);
    setError("");
    setPrompt("");
    setMessages((previous) => [...previous.slice(-23), { role: "user", content: text }]);
    try {
      const answer = await officeApi.sendPrivateMessage(agentId, text, messages, controller.signal);
      if (controller.signal.aborted) return;
      setMessages((previous) => [...previous, { role: "assistant", content: answer.response }]);
      setProvider(`${answer.provider}${answer.model ? ` / ${answer.model}` : ""}`);
    } catch {
      if (!controller.signal.aborted) {
        setError("Could not reach your agent. Please try sending again.");
        setPrompt(text);
        setMessages((previous) => previous.slice(0, -1));
      }
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setThinking(false);
      }
    }
  }

  function close() {
    pending.current?.abort();
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="pixel-panel max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl gap-3 overflow-y-auto rounded-none sm:rounded-none">
        <DialogTitle
          className="pixel-font pr-6 text-[10px] leading-6"
          style={{ color: meta.color }}
        >
          PRIVATE MEETING — {meta.name}
        </DialogTitle>
        <DialogDescription className="font-mono text-sm">
          {DESK_VISUALS[agentId].role} ·{" "}
          {arriving ? "Agent walking to meeting…" : thinking ? "Thinking…" : "Meeting active"}
        </DialogDescription>
        <div
          role="log"
          aria-label="Private conversation"
          aria-live="polite"
          className="h-64 overflow-y-auto border-4 border-border p-3 font-mono text-sm"
          style={{ background: "var(--terminal-bg)", color: "var(--terminal-text)" }}
        >
          {!messages.length && <p>Ask {meta.name} a question. Only this agent will respond.</p>}
          {messages.map((message, index) => (
            <div key={index} className="mb-4 whitespace-pre-wrap break-words">
              <strong>{message.role === "user" ? "You" : meta.name}:</strong>
              {"\n"}
              {message.content}
            </div>
          ))}
          {thinking && <p>{meta.name} is thinking… Local generation can take several minutes.</p>}
          <div ref={bottom} />
        </div>
        {provider && (
          <p className="font-mono text-xs text-muted-foreground">Answered by {provider}</p>
        )}
        {error && (
          <p role="alert" className="font-mono text-sm text-destructive">
            {error}
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="space-y-3"
        >
          <label htmlFor="meeting-prompt" className="font-mono text-sm">
            Ask {meta.name}
          </label>
          <textarea
            id="meeting-prompt"
            className="pixel-input w-full font-mono text-sm"
            rows={3}
            maxLength={16000}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={thinking}
            placeholder={`Message the ${meta.name} agent…`}
          />
          <div className="flex justify-between gap-3">
            <button type="button" className="pixel-btn text-[9px]" onClick={close}>
              End Meeting
            </button>
            <button
              type="submit"
              className="pixel-btn text-[9px] disabled:opacity-40"
              disabled={arriving || thinking || !prompt.trim()}
            >
              Send
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
