export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".flac", ".webm"]);
const ALLOWED_MIME_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac", "audio/ogg", "audio/flac", "audio/webm"]);

export function parseAudioUpload(fileName: string, dataUrl: string): { buffer: Buffer; extension: string } {
  const match = dataUrl.match(/^data:(audio\/[-A-Za-z0-9+.]+);base64,(.+)$/s);
  if (!match) {
    throw new Error("Only base64-encoded audio uploads are allowed.");
  }

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported audio type: ${mimeType}`);
  }

  const extensionMatch = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  const extension = extensionMatch ? `.${extensionMatch[1]}` : "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Unsupported audio file extension.");
  }

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) {
    throw new Error("The audio file is empty.");
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error("The audio file exceeds the 50 MB limit.");
  }

  return { buffer, extension };
}
