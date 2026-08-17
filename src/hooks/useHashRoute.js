import { useState, useEffect, useCallback } from "react";

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [page, ...rest] = raw.split("/");
  return { page: page || "dashboard", param: rest.join("/") || null };
}

export function useHashRoute() {
  const [{ page, param }, setState] = useState(parseHash);

  useEffect(() => {
    const onHashChange = () => setState(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((next, nextParam) => {
    const target = nextParam ? `${next}/${nextParam}` : next;
    window.location.hash = `/${target}`;
    setState({ page: next, param: nextParam || null });
  }, []);

  return [page, param, navigate];
}
