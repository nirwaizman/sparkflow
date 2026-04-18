import { UnsupportedMimeError } from "../types";

export interface ParseFileInput {
  path?: string;
  buffer?: Buffer | Uint8Array;
  mime: string;
}

export interface ParsedFile {
  text: string;
  metadata: Record<string, unknown>;
}

async function readInput(input: ParseFileInput): Promise<Uint8Array> {
  if (input.buffer) {
    return input.buffer instanceof Uint8Array
      ? input.buffer
      : new Uint8Array(input.buffer);
  }
  if (input.path) {
    const fs = await import("node:fs/promises");
    const buf = await fs.readFile(input.path);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  throw new Error("parseFile requires either path or buffer");
}

/**
 * Parse a file into plain text + metadata based on MIME type.
 * Supported: application/pdf, docx, text/markdown, text/plain.
 */
export async function parseFile(input: ParseFileInput): Promise<ParsedFile> {
  const mime = input.mime.toLowerCase();

  if (mime === "application/pdf") {
    const bytes = await readInput(input);
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const result = (await extractText(pdf, { mergePages: true })) as {
      text: string | string[];
      totalPages?: number;
    };
    let text = "";
    if (typeof result.text === "string") {
      text = result.text;
    } else if (Array.isArray(result.text)) {
      text = result.text.join("\n\n");
    }
    return {
      text,
      metadata: {
        mime,
        pages: result.totalPages,
        source: input.path,
      },
    };
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const bytes = await readInput(input);
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return {
      text: typeof result?.value === "string" ? result.value : "",
      metadata: { mime, source: input.path },
    };
  }

  if (mime === "text/markdown" || mime === "text/plain") {
    const bytes = await readInput(input);
    const text = new TextDecoder("utf-8").decode(bytes);
    return { text, metadata: { mime, source: input.path } };
  }

  throw new UnsupportedMimeError(mime);
}
