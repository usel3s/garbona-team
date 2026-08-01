const axios = require("axios");
const { env } = require("../config/env");
const { logger } = require("./logger");

/** @type {Map<string, { url: string; width: number; height: number; uniqueId: string; at: number }>} */
const thumbCache = new Map();
const THUMB_TTL_MS = 6 * 60 * 60 * 1000;

function pickProfileSize(sizes) {
  if (!sizes?.length) return null;
  const sorted = [...sizes].sort((a, b) => Number(a.width || 0) - Number(b.width || 0));
  return (
    sorted.find((s) => Number(s.width || 0) >= 160) ||
    sorted[sorted.length - 1] ||
    sorted[0] ||
    null
  );
}

async function getProfilePhotoMeta(telegram, telegramId) {
  try {
    const photos = await telegram.getUserProfilePhotos(Number(telegramId), 0, 1);
    const sizes = photos?.photos?.[0];
    const pick = pickProfileSize(sizes);
    if (!pick?.file_id) return null;
    return {
      fileId: pick.file_id,
      uniqueId: String(pick.file_unique_id || pick.file_id),
      width: Number(pick.width) || 320,
      height: Number(pick.height) || 320,
    };
  } catch (error) {
    logger.warn("getUserProfilePhotos failed", String(telegramId), error.message);
    return null;
  }
}

async function getProfilePhotoFileId(telegram, telegramId) {
  const meta = await getProfilePhotoMeta(telegram, telegramId);
  return meta?.fileId || null;
}

async function downloadTelegramFile(filePath) {
  const url = `https://api.telegram.org/file/bot${env.botToken}/${filePath}`;
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
  return Buffer.from(res.data);
}

async function uploadPublicJpeg(buffer) {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", new Blob([buffer], { type: "image/jpeg" }), "avatar.jpg");
  const res = await axios.post("https://catbox.moe/user/api.php", form, { timeout: 20000 });
  const url = String(res.data || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

/**
 * Публичный JPEG для thumbnail_url у InlineQueryResultArticle.
 */
async function getProfileThumbnail(telegram, user) {
  const telegramId = String(user?.telegramId || "");
  if (!telegramId) return null;

  const meta = await getProfilePhotoMeta(telegram, telegramId);
  if (meta) {
    const cached = thumbCache.get(telegramId);
    if (cached && cached.uniqueId === meta.uniqueId && Date.now() - cached.at < THUMB_TTL_MS) {
      return { url: cached.url, width: cached.width, height: cached.height };
    }

    try {
      const file = await telegram.getFile(meta.fileId);
      if (!file?.file_path) return null;
      const buffer = await downloadTelegramFile(file.file_path);
      const publicUrl = await uploadPublicJpeg(buffer);
      if (!publicUrl) return null;

      const thumb = {
        url: publicUrl,
        width: meta.width,
        height: meta.height,
        uniqueId: meta.uniqueId,
        at: Date.now(),
      };
      thumbCache.set(telegramId, thumb);
      return { url: thumb.url, width: thumb.width, height: thumb.height };
    } catch (error) {
      logger.warn("profile thumbnail upload failed", telegramId, error.message);
    }
  }

  const username = String(user?.username || "")
    .trim()
    .replace(/^@/, "");
  if (username) {
    return {
      url: `https://t.me/i/userpic/320/${username}.jpg`,
      width: 320,
      height: 320,
    };
  }

  return null;
}

module.exports = {
  getProfilePhotoFileId,
  getProfileThumbnail,
};
