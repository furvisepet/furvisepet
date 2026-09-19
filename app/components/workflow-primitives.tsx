import { Dialog, DocumentStatus, EmptyState } from "./product-primitives";

export function WorkflowDialog({ children, title }: { children: React.ReactNode; title: string }) {
  return <Dialog title={title}>{children}</Dialog>;
}

export function WorkflowEmptyState({ text, title }: { text: string; title: string }) {
  return <div className="mt-8"><EmptyState description={text} title={title} /></div>;
}

export function WorkflowDocumentStatus({ status }: { status: "Draft" | "Confirmed" | "New version in progress" }) {
  return <DocumentStatus status={status} />;
}
