const crypto = require("crypto");

const MIN_LENGTH = 8;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashAppPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64, SCRYPT_PARAMS).toString("hex");
  return `${salt}:${hash}`;
}

function verifyAppPassword(password, stored) {
  const raw = String(stored || "");
  const [salt, hash] = raw.split(":");
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(String(password), salt, 64, SCRYPT_PARAMS).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(derived, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function validateNewPassword(password) {
  const value = String(password || "");
  if (value.length < MIN_LENGTH) {
    return { ok: false, error: `Пароль должен быть не короче ${MIN_LENGTH} символов` };
  }
  return { ok: true };
}

function appLoginOf(user) {
  return String(user?.username || user?.telegramId || "").trim();
}

module.exports = {
  MIN_LENGTH,
  hashAppPassword,
  verifyAppPassword,
  validateNewPassword,
  appLoginOf,
};
