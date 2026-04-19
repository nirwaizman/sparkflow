/**
 * Shared types for the meeting-notes pipeline.
 *
 * The pipeline flows:
 *   audio buffer -> transcribeAudio -> diarizeTranscript -> summarizeMeeting
 *                                                        -> exportMarkdown/Pdf
 */

export type TranscriptSegment = {
  /** Inclusive start timestamp in milliseconds, relative to audio start. */
  startMs: number;
  /** Exclusive end timestamp in milliseconds. */
  endMs: number;
  text: string;
};

export type TranscriptionResult = {
  text: string;
  /** Raw Whisper segments when the model returned verbose_json. */
  segments?: TranscriptSegment[];
  /** ISO 639-1 code when detected or requested. */
  language?: string;
};

export type DiarizedTurn = {
  /** Opaque speaker label, e.g. "Speaker 1", "Alex", etc. */
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
};

export type ActionItem = {
  /** What needs to be done. */
  text: string;
  /** Assignee by name or handle when inferable from the transcript. */
  assignee?: string;
  /** Natural-language due date (e.g. "Friday", "2025-05-01") if stated. */
  dueDate?: string;
};

export type Decision = {
  text: string;
  /** Short rationale captured from the transcript, if any. */
  rationale?: string;
};

export type MeetingSummary = {
  summary: string;
  actionItems: ActionItem[];
  decisions: Decision[];
  participants: string[];
  topics: string[];
};

/**
 * A fully-processed meeting, ready for rendering or export.
 */
export type MeetingNotes = MeetingSummary & {
  id: string;
  title: string;
  createdAt: string;
  transcript: string;
  turns: DiarizedTurn[];
  language?: string;
  durationMs?: number;
};

/**
 * Item returned from the in-memory store; mirrors the future
 * Postgres row so the migration (see TODO in `store.ts`) is
 * mechanical.
 */
export type MeetingRecord = {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  storagePath: string;
  mime: string;
  sizeBytes: number;
  status: "uploaded" | "processing" | "ready" | "failed";
  error?: string;
  createdAt: string;
  updatedAt: string;
  notes?: MeetingNotes;
};
