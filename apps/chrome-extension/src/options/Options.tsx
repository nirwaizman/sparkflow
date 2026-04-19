import { useEffect, useState } from "react";
import {
  getSettings,
  saveSettings,
  type BackendSettings,
} from "../lib/backend";

const styles: Record<string, Record<string, string | number>> = {
  wrap: {
    maxWidth: 560,
    margin: "32px auto",
    padding: 24,
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  title: { margin: 0, fontSize: 18, fontWeight: 600 },
  label: { fontSize: 12, fontWeight: 600, color: "#334155" },
  input: {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box",
  },
  row: { display: "flex", flexDirection: "column", gap: 4 },
  actions: { display: "flex", gap: 10, marginTop: 6 },
  primary: {
    appearance: "none",
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "white",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    cursor: "pointer",
  },
  secondary: {
    appearance: "none",
    border: "1px solid #e2e8f0",
    background: "white",
    color: "#0f172a",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    cursor: "pointer",
  },
  status: { fontSize: 12, color: "#475569" },
  error: { fontSize: 12, color: "#b91c1c" },
  help: { fontSize: 11, color: "#64748b" },
};

export function Options() {
  const [values, setValues] = useState<BackendSettings>({
    backendUrl: "",
    token: "",
    defaultModel: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setValues(s);
        setLoaded(true);
      })
      .catch((e) => setError(String(e)));
  }, []);

  function update<K extends keyof BackendSettings>(key: K, value: BackendSettings[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setError(null);
    setStatus("Saving…");
    try {
      await saveSettings(values);
      setStatus("Saved.");
    } catch (e) {
      setStatus(null);
      setError(String(e));
    }
  }

  async function test() {
    setError(null);
    setStatus("Testing connection…");
    try {
      const url = values.backendUrl.trim().replace(/\/$/, "");
      const res = await fetch(`${url}/api/health`, {
        headers: values.token
          ? { Authorization: `Bearer ${values.token}` }
          : undefined,
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setStatus("Backend reachable.");
    } catch (e) {
      setStatus(null);
      setError(String(e));
    }
  }

  if (!loaded) {
    return <div style={styles.wrap as never}>Loading…</div>;
  }

  return (
    <div style={styles.wrap as never}>
      <h1 style={styles.title as never}>SparkFlow settings</h1>

      <div style={styles.row as never}>
        <label style={styles.label as never} htmlFor="backendUrl">
          Backend URL
        </label>
        <input
          id="backendUrl"
          style={styles.input as never}
          value={values.backendUrl}
          placeholder="https://app.sparkflow.ai"
          onChange={(e: { target: { value: string } }) => update("backendUrl", e.target.value)}
        />
        <span style={styles.help as never}>
          The SparkFlow web backend that serves `/api/chat/stream`.
        </span>
      </div>

      <div style={styles.row as never}>
        <label style={styles.label as never} htmlFor="token">
          API token
        </label>
        <input
          id="token"
          style={styles.input as never}
          value={values.token}
          type="password"
          placeholder="sf_•••"
          onChange={(e: { target: { value: string } }) => update("token", e.target.value)}
        />
        <span style={styles.help as never}>
          Stored in chrome.storage.local. Used as `Authorization: Bearer …`.
        </span>
      </div>

      <div style={styles.row as never}>
        <label style={styles.label as never} htmlFor="defaultModel">
          Default model
        </label>
        <input
          id="defaultModel"
          style={styles.input as never}
          value={values.defaultModel}
          placeholder="sparkflow-default"
          onChange={(e: { target: { value: string } }) => update("defaultModel", e.target.value)}
        />
      </div>

      <div style={styles.actions as never}>
        <button style={styles.primary as never} onClick={() => void save()}>
          Save
        </button>
        <button style={styles.secondary as never} onClick={() => void test()}>
          Test connection
        </button>
      </div>

      {status ? <div style={styles.status as never}>{status}</div> : null}
      {error ? <div style={styles.error as never}>{error}</div> : null}
    </div>
  );
}
