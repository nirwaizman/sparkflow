/**
 * Export helpers for meeting notes.
 *
 *   - `exportMarkdown(notes)` returns a GitHub-flavoured Markdown string.
 *   - `exportPdf(notes)` renders the same content to a Buffer via
 *     `@react-pdf/renderer`'s `renderToBuffer`.
 *
 * We intentionally keep the two outputs structurally parallel so the UI can
 * offer them as alternate download formats for the same notes object.
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { MeetingNotes } from "./types";

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

export function exportMarkdown(notes: MeetingNotes): string {
  const lines: string[] = [];
  lines.push(`# ${notes.title}`);
  lines.push("");
  lines.push(`_${new Date(notes.createdAt).toLocaleString()}_`);
  lines.push("");

  if (notes.participants.length > 0) {
    lines.push("## Participants");
    for (const p of notes.participants) lines.push(`- ${p}`);
    lines.push("");
  }

  if (notes.topics.length > 0) {
    lines.push("## Topics");
    lines.push(notes.topics.map((t) => `\`${t}\``).join(" "));
    lines.push("");
  }

  lines.push("## Summary");
  lines.push(notes.summary);
  lines.push("");

  if (notes.decisions.length > 0) {
    lines.push("## Decisions");
    for (const d of notes.decisions) {
      lines.push(`- **${d.text}**${d.rationale ? ` — ${d.rationale}` : ""}`);
    }
    lines.push("");
  }

  if (notes.actionItems.length > 0) {
    lines.push("## Action items");
    for (const a of notes.actionItems) {
      const meta: string[] = [];
      if (a.assignee) meta.push(`@${a.assignee}`);
      if (a.dueDate) meta.push(`due ${a.dueDate}`);
      const tail = meta.length > 0 ? ` _(${meta.join(", ")})_` : "";
      lines.push(`- [ ] ${a.text}${tail}`);
    }
    lines.push("");
  }

  if (notes.turns.length > 0) {
    lines.push("## Transcript");
    for (const turn of notes.turns) {
      lines.push(`**${turn.speaker}** _(${formatTimestamp(turn.startMs)})_`);
      lines.push("");
      lines.push(turn.text);
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

const pdfStyles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 11,
    fontFamily: "Helvetica",
    lineHeight: 1.4,
  },
  h1: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  meta: { fontSize: 10, color: "#666", marginBottom: 16 },
  h2: { fontSize: 14, fontWeight: 700, marginTop: 16, marginBottom: 8 },
  body: { marginBottom: 8 },
  bullet: { flexDirection: "row", marginBottom: 4 },
  bulletDot: { width: 12 },
  bulletBody: { flex: 1 },
  pill: {
    fontSize: 9,
    color: "#fff",
    backgroundColor: "#444",
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 2,
    paddingBottom: 2,
    marginRight: 4,
    marginBottom: 4,
    borderRadius: 4,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  turnHeader: {
    fontSize: 10,
    color: "#333",
    fontWeight: 700,
    marginTop: 8,
    marginBottom: 2,
  },
  turnBody: { fontSize: 11, marginBottom: 4 },
});

function MeetingPdfDocument({ notes }: { notes: MeetingNotes }): React.ReactElement {
  return (
    <Document>
      <Page size="LETTER" style={pdfStyles.page} wrap>
        <Text style={pdfStyles.h1}>{notes.title}</Text>
        <Text style={pdfStyles.meta}>
          {new Date(notes.createdAt).toLocaleString()}
        </Text>

        {notes.participants.length > 0 ? (
          <>
            <Text style={pdfStyles.h2}>Participants</Text>
            {notes.participants.map((p, i) => (
              <View key={`p-${i}`} style={pdfStyles.bullet}>
                <Text style={pdfStyles.bulletDot}>•</Text>
                <Text style={pdfStyles.bulletBody}>{p}</Text>
              </View>
            ))}
          </>
        ) : null}

        {notes.topics.length > 0 ? (
          <>
            <Text style={pdfStyles.h2}>Topics</Text>
            <View style={pdfStyles.pillRow}>
              {notes.topics.map((t, i) => (
                <Text key={`t-${i}`} style={pdfStyles.pill}>
                  {t}
                </Text>
              ))}
            </View>
          </>
        ) : null}

        <Text style={pdfStyles.h2}>Summary</Text>
        <Text style={pdfStyles.body}>{notes.summary}</Text>

        {notes.decisions.length > 0 ? (
          <>
            <Text style={pdfStyles.h2}>Decisions</Text>
            {notes.decisions.map((d, i) => (
              <View key={`d-${i}`} style={pdfStyles.bullet}>
                <Text style={pdfStyles.bulletDot}>•</Text>
                <Text style={pdfStyles.bulletBody}>
                  {d.text}
                  {d.rationale ? ` — ${d.rationale}` : ""}
                </Text>
              </View>
            ))}
          </>
        ) : null}

        {notes.actionItems.length > 0 ? (
          <>
            <Text style={pdfStyles.h2}>Action items</Text>
            {notes.actionItems.map((a, i) => {
              const meta: string[] = [];
              if (a.assignee) meta.push(`@${a.assignee}`);
              if (a.dueDate) meta.push(`due ${a.dueDate}`);
              const tail = meta.length > 0 ? ` (${meta.join(", ")})` : "";
              return (
                <View key={`a-${i}`} style={pdfStyles.bullet}>
                  <Text style={pdfStyles.bulletDot}>☐</Text>
                  <Text style={pdfStyles.bulletBody}>
                    {a.text}
                    {tail}
                  </Text>
                </View>
              );
            })}
          </>
        ) : null}

        {notes.turns.length > 0 ? (
          <>
            <Text style={pdfStyles.h2}>Transcript</Text>
            {notes.turns.map((turn, i) => (
              <View key={`turn-${i}`} wrap={false}>
                <Text style={pdfStyles.turnHeader}>
                  {turn.speaker} · {formatTimestamp(turn.startMs)}
                </Text>
                <Text style={pdfStyles.turnBody}>{turn.text}</Text>
              </View>
            ))}
          </>
        ) : null}
      </Page>
    </Document>
  );
}

export async function exportPdf(notes: MeetingNotes): Promise<Buffer> {
  return renderToBuffer(<MeetingPdfDocument notes={notes} />);
}
