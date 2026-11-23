import assert from "node:assert/strict";
import test from "node:test";

import { MAX_AUDIO_BYTES, parseAudioUpload } from "../server/audio.ts";

test("accepts a valid base64 MP3 upload", () => {
  const result = parseAudioUpload("song.mp3", "data:audio/mpeg;base64,U1RS");
  assert.equal(result.extension, ".mp3");
  assert.equal(result.buffer.toString("base64"), "U1RS");
});

test("rejects non-audio data URLs", () => {
  assert.throws(() => parseAudioUpload("image.png", "data:image/png;base64,U1RS"), /base64-encoded audio/);
});

test("rejects unsupported audio extensions", () => {
  assert.throws(() => parseAudioUpload("song.exe", "data:audio/mpeg;base64,U1RS"), /Unsupported audio file extension/);
});

test("rejects audio payloads larger than 50 MB", () => {
  const oversized = Buffer.alloc(MAX_AUDIO_BYTES + 1).toString("base64");
  assert.throws(() => parseAudioUpload("song.mp3", `data:audio/mpeg;base64,${oversized}`), /50 MB/);
});
