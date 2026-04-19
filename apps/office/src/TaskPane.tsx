import * as React from "react";
/// <reference types="office-js" />
// TODO: drop the triple-slash reference above once @types/office-js is
// installed via pnpm and picked up through the normal types resolution.

import { useEffect, useState } from "react";
import WordPane from "./word/WordPane";
import ExcelPane from "./excel/ExcelPane";
import PptPane from "./powerpoint/PptPane";
import { getBackendUrl, setBackendUrl } from "./lib/backend";

type Host = "Word" | "Excel" | "PowerPoint" | "Unknown";

function detectHost(): Host {
  // Office.context.host is populated after Office.onReady resolves.
  const h = Office.context?.host;
  if (h === Office.HostType.Word) return "Word";
  if (h === Office.HostType.Excel) return "Excel";
  if (h === Office.HostType.PowerPoint) return "PowerPoint";
  return "Unknown";
}

export default function TaskPane(): React.ReactElement {
  const [host, setHost] = useState<Host>("Unknown");
  const [ready, setReady] = useState(false);
  const [backend, setBackend] = useState<string>(getBackendUrl());

  useEffect(() => {
    // Office.onReady is safe to call multiple times and resolves immediately
    // if the host has already initialized.
    Office.onReady(() => {
      setHost(detectHost());
      setReady(true);
    });
  }, []);

  function onBackendChange(value: string): void {
    setBackend(value);
    setBackendUrl(value);
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 16 }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>SparkFlow</h1>
        <p style={{ margin: "4px 0 0", color: "#666", fontSize: 12 }}>
          {ready ? `Host: ${host}` : "Connecting to Office\u2026"}
        </p>
      </header>

      <label style={{ display: "block", fontSize: 12, marginBottom: 16 }}>
        Backend URL
        <input
          type="url"
          value={backend}
          onChange={(e) => onBackendChange(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box" }}
          placeholder="http://localhost:3001"
        />
      </label>

      {ready && host === "Word" && <WordPane />}
      {ready && host === "Excel" && <ExcelPane />}
      {ready && host === "PowerPoint" && <PptPane />}
      {ready && host === "Unknown" && (
        <p style={{ color: "#c33" }}>
          Unsupported host. SparkFlow supports Word, Excel, and PowerPoint.
        </p>
      )}
    </div>
  );
}
