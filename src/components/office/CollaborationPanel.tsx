import { type OfficeTask, taskFinished } from "@/lib/office-collaboration";

export function CollaborationPanel({ task }: { task: OfficeTask }) {
  return (
    <div className="pixel-border space-y-2 bg-card p-2 font-mono text-sm">
      <div className="flex justify-between gap-2 text-xs text-primary">
        <span>OFFICE {task.status.toUpperCase().replaceAll("_", " ")}</span>
        <span>Owner: {task.final_owner}</span>
      </div>
      <details open={!taskFinished(task)}>
        <summary className="cursor-pointer text-muted-foreground">Assignments & handoffs</summary>
        <ol className="mt-2 space-y-2">
          {task.plan.map((assignment) => (
            <li key={assignment.agent} className="border-l-2 border-border pl-2">
              <strong className="text-xs uppercase">
                {assignment.agent} · {assignment.state}
              </strong>
              <p className="text-xs leading-relaxed">{assignment.subtask}</p>
              {!!assignment.depends_on.length && (
                <p className="text-xs text-muted-foreground">
                  Needs: {assignment.depends_on.join(", ")}
                </p>
              )}
              {assignment.revisions > 0 && (
                <p className="text-xs text-primary">Revision pass: {assignment.revisions}/1</p>
              )}
            </li>
          ))}
        </ol>
        <h3 className="mt-3 text-xs text-primary">OFFICE ACTIVITY</h3>
        <ol
          aria-label="Office collaboration activity"
          className="mt-1 max-h-48 space-y-2 overflow-y-auto text-xs"
        >
          {task.messages.map((message) => (
            <li key={message.id}>
              <span className="text-muted-foreground">
                {new Date(message.ts * 1000).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
              </span>
              <strong>
                {message.sender}
                {message.recipient ? ` → ${message.recipient}` : ""}
              </strong>
              <span className="block whitespace-pre-wrap break-words">{message.text}</span>
            </li>
          ))}
        </ol>
      </details>
      {!!task.warnings.length && (
        <ul className="space-y-1 text-xs text-amber-400">
          {task.warnings.map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
        </ul>
      )}
      {task.final_report && (
        <details open>
          <summary className="cursor-pointer text-primary">
            FINAL OFFICE REPORT · {task.synthesis_provider ?? "compiled"}
          </summary>
          <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
            {task.final_report}
          </div>
        </details>
      )}
    </div>
  );
}
