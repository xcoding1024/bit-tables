import { useState } from "react";

export function useGuideDialogs() {
  const [kind, setKind] = useState<"open" | "create" | "">("");
  const [openPath, setOpenPath] = useState("");
  const [createPath, setCreatePath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function startOpen() {
    setError("");
    setOpenPath("");
    setKind("open");
  }

  function startCreate() {
    setError("");
    setCreatePath("");
    setKind("create");
  }

  return {
    kind,
    openPath,
    createPath,
    busy,
    error,
    setKind,
    setOpenPath,
    setCreatePath,
    setBusy,
    setError,
    startOpen,
    startCreate,
  };
}
