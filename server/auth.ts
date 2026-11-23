import crypto from "node:crypto";

export const PASSWORD_HASH_PREFIX = "sha256_v1:";
export const PASSWORD_SALT = "OurHome_Secret_Salt";

export function hashPassword(password: string): string {
  const hash = crypto.createHash("sha256").update(`${PASSWORD_SALT}:${password}:${PASSWORD_SALT}`).digest("hex");
  return `${PASSWORD_HASH_PREFIX}${hash}`;
}

export async function verifyPassword(inputPassword: string, storedPassword: string): Promise<boolean> {
  if (!storedPassword) return false;

  if (storedPassword.startsWith(PASSWORD_HASH_PREFIX)) {
    const calculated = hashPassword(inputPassword);
    const stored = Buffer.from(storedPassword);
    const candidate = Buffer.from(calculated);
    return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
  }

  const stored = Buffer.from(storedPassword);
  const candidate = Buffer.from(inputPassword);
  return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}

export function verifySecret(receivedSecret: unknown, configuredSecret: string | undefined, requireConfigured = false): boolean {
  if (!configuredSecret) return !requireConfigured;
  if (typeof receivedSecret !== "string") return false;

  const received = Buffer.from(receivedSecret);
  const configured = Buffer.from(configuredSecret);
  return received.length === configured.length && crypto.timingSafeEqual(received, configured);
}

export interface ServerSessionPayload {
  username: string;
  coupleId: string;
  role: "admin" | "partner" | "guest" | "user";
  expiresAt: number;
}

function getSessionSecret(): string {
  return process.env.SERVER_SESSION_SECRET || "development-only-session-secret-change-me";
}

export function createServerSession(payload: Omit<ServerSessionPayload, "expiresAt">, durationMinutes = 480): string {
  const fullPayload: ServerSessionPayload = {
    ...payload,
    expiresAt: Date.now() + durationMinutes * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const signature = crypto.createHmac("sha256", getSessionSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyServerSession(token: unknown): ServerSessionPayload | null {
  if (typeof token !== "string") return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;

  const expected = crypto.createHmac("sha256", getSessionSecret()).update(encoded).digest("base64url");
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ServerSessionPayload;
    if (!payload.username || !payload.coupleId || !payload.role || !payload.expiresAt) return null;
    if (payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createTemporaryAuthPassword(): string {
  return crypto.randomBytes(32).toString("hex");
}
