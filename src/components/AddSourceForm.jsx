import React, { useState } from "react";
import { Icon } from "../lib/Icon.jsx";
import { uid } from "../lib/format.js";

export function AddSourceForm({ onAdd }) {
  const [label, setLabel] = useState("");
  const [link, setLink] = useState("");
  const submit = () => {
    if (!label.trim()) return;
    onAdd({ id: uid(), label: label.trim(), link: link.trim() });
    setLabel("");
    setLink("");
  };
  return (
    <div className="flex flex-col gap-2" style={{ flexDirection: "row", flexWrap: "wrap" }}>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Source label (e.g. SNB Statement - Jul)"
        className="input flex-1"
        style={{ minWidth: 180 }}
      />
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Link / file path (optional)"
        className="input flex-1"
        style={{ minWidth: 180 }}
      />
      <button onClick={submit} className="btn btn-secondary shrink-0">
        <Icon name="plus" size={14} /> Add
      </button>
    </div>
  );
}
