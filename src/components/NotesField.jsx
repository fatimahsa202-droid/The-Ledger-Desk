import React from "react";
import { useDebouncedCommit } from "../hooks/useStoredState.js";

export function NotesField({ id, value, onCommit, placeholder }) {
  const [local, setLocal] = useDebouncedCommit(id, value, onCommit);
  return (
    <textarea
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder={placeholder || "Notes..."}
      rows={3}
      className="textarea"
      aria-label="Notes"
    />
  );
}
