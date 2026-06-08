import { Button } from "@/components/ui/button";

export function MessageModal({
  open,
  title,
  message,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md mx-4 rounded-lg border bg-card p-6 shadow-lg">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <div className="text-sm text-muted-foreground whitespace-pre-line mb-6">
          {message}
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={onClose}>确定</Button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-md mx-4 rounded-lg border bg-card p-6 shadow-lg">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <div className="text-sm text-muted-foreground whitespace-pre-line mb-6">
          {message}
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}>取消</Button>
          <Button size="sm" onClick={onConfirm}>确定</Button>
        </div>
      </div>
    </div>
  );
}
