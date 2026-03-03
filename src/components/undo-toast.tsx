"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface UndoAction {
  id: string;
  label: string;
  undo: () => Promise<void>;
  timestamp: number;
}

const TOAST_DURATION = 8000;

export function useUndo() {
  const [stack, setStack] = useState<UndoAction[]>([]);

  const addUndo = useCallback((label: string, undo: () => Promise<void>) => {
    const action: UndoAction = {
      id: crypto.randomUUID(),
      label,
      undo,
      timestamp: Date.now(),
    };
    setStack((prev) => [action, ...prev].slice(0, 5));
  }, []);

  const removeAction = useCallback((id: string) => {
    setStack((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const performUndo = useCallback(async (id: string) => {
    const action = stack.find((a) => a.id === id);
    if (!action) return;
    await action.undo();
    removeAction(id);
  }, [stack, removeAction]);

  return { stack, addUndo, removeAction, performUndo };
}

export function UndoToast({
  stack,
  onUndo,
  onDismiss,
}: {
  stack: UndoAction[];
  onUndo: (id: string) => Promise<void>;
  onDismiss: (id: string) => void;
}) {
  if (stack.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {stack.map((action) => (
        <ToastItem key={action.id} action={action} onUndo={onUndo} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  action,
  onUndo,
  onDismiss,
}: {
  action: UndoAction;
  onUndo: (id: string) => Promise<void>;
  onDismiss: (id: string) => void;
}) {
  const [undoing, setUndoing] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(action.id), 300);
    }, TOAST_DURATION);
    return () => clearTimeout(timerRef.current);
  }, [action.id, onDismiss]);

  async function handleUndo() {
    clearTimeout(timerRef.current);
    setUndoing(true);
    await onUndo(action.id);
  }

  return (
    <div
      className={`flex items-center gap-3 bg-gray-900 text-white text-sm rounded-lg shadow-lg px-4 py-3 transition-all duration-300 ${
        exiting ? "opacity-0 translate-x-4" : "opacity-100"
      }`}
    >
      <span className="flex-1 min-w-0 truncate">{action.label}</span>
      <button
        onClick={handleUndo}
        disabled={undoing}
        className="text-blue-400 hover:text-blue-300 font-medium flex-shrink-0 disabled:opacity-50"
      >
        {undoing ? "Undoing..." : "Undo"}
      </button>
      <button
        onClick={() => { clearTimeout(timerRef.current); onDismiss(action.id); }}
        className="text-gray-400 hover:text-white flex-shrink-0"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}
