const Feedback = require("../models/Feedback");
const { env } = require("../config/env");
const { pe } = require("../utils/emoji");
const { logger } = require("../utils/logger");

const TYPE_LABELS = {
  bug: "Баг",
  question: "Вопрос",
  idea: "Идея",
};

const STATUS_LABELS = {
  open: "Открыто",
  closed: "Закрыто",
};

function typeLabel(type) {
  return TYPE_LABELS[type] || type || "—";
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "—";
}

function typeEmojiKey(type) {
  if (type === "bug") return "error";
  if (type === "question") return "info";
  if (type === "idea") return "gift";
  return "notification";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatWhen(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(text, max = 120) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

async function listUserFeedback(telegramId, limit = 40) {
  return Feedback.find({ telegramId: String(telegramId) })
    .sort({ createdAt: -1 })
    .limit(Math.min(50, Math.max(1, Number(limit) || 40)));
}

async function getFeedbackById(id) {
  if (!/^[a-f0-9]{24}$/i.test(String(id || ""))) return null;
  return Feedback.findById(id);
}

async function createFeedback(user, { type, text }) {
  const normalizedType = String(type || "").trim();
  if (!TYPE_LABELS[normalizedType]) {
    throw new Error("Выберите направление: баг, вопрос или идея.");
  }

  const body = String(text || "").trim();
  if (body.length < 5) {
    throw new Error("Напишите обращение подробнее (минимум 5 символов).");
  }
  if (body.length > 2000) {
    throw new Error("Слишком длинный текст (максимум 2000 символов).");
  }

  const recent = await Feedback.findOne({
    telegramId: String(user.telegramId),
    createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
  }).sort({ createdAt: -1 });
  if (recent) {
    throw new Error("Подождите минуту перед следующим обращением.");
  }

  const openCount = await Feedback.countDocuments({
    telegramId: String(user.telegramId),
    status: "open",
  });
  if (openCount >= 10) {
    throw new Error("Слишком много открытых обращений. Дождитесь ответа по текущим.");
  }

  return Feedback.create({
    telegramId: String(user.telegramId),
    username: user.username || "",
    firstName: user.firstName || "",
    type: normalizedType,
    text: body,
    status: "open",
  });
}

function buildUserTicketHtml(ticket) {
  return [
    `${pe(typeEmojiKey(ticket.type))} <b>${escapeHtml(typeLabel(ticket.type))}</b>`,
    `${pe("tag")} ID: <code>${ticket._id}</code>`,
    `${pe("time")} ${escapeHtml(formatWhen(ticket.createdAt))}`,
    `${pe("visible")} Статус: <b>${escapeHtml(statusLabel(ticket.status))}</b>`,
    "",
    escapeHtml(ticket.text),
    ticket.adminReply
      ? `\n${pe("success")} <b>Ответ:</b>\n${escapeHtml(ticket.adminReply)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildAdminTicketHtml(ticket) {
  const nick = ticket.username ? `@${ticket.username}` : "без username";
  return [
    `${pe("notification")} <b>Новый фидбек</b>`,
    "",
    `${pe(typeEmojiKey(ticket.type))} Тип: <b>${escapeHtml(typeLabel(ticket.type))}</b>`,
    `${pe("tag")} Ticket: <code>${ticket._id}</code>`,
    `${pe("profile")} ${escapeHtml(nick)} · <code>${escapeHtml(ticket.telegramId)}</code>`,
    `${pe("time")} ${escapeHtml(formatWhen(ticket.createdAt))}`,
    "",
    escapeHtml(ticket.text),
  ].join("\n");
}

async function notifyAdminsAboutFeedback(telegram, ticket) {
  const html = buildAdminTicketHtml(ticket);
  const channelId = env.feedbackChannelId || env.applicationsChannelId;
  const targets = [];
  if (channelId) {
    targets.push(String(channelId));
  } else {
    for (const adminId of env.adminIds) {
      if (adminId) targets.push(String(adminId));
    }
  }

  let channelMessageId = "";
  for (const target of targets) {
    try {
      const msg = await telegram.sendMessage(target, html, { parse_mode: "HTML" });
      if (!channelMessageId && channelId && target === String(channelId)) {
        channelMessageId = String(msg.message_id);
      }
    } catch (error) {
      logger.warn("Feedback notify failed", target, error.message);
    }
  }

  if (channelMessageId) {
    ticket.channelMessageId = channelMessageId;
    await ticket.save();
  }
}

module.exports = {
  TYPE_LABELS,
  STATUS_LABELS,
  typeLabel,
  statusLabel,
  typeEmojiKey,
  escapeHtml,
  formatWhen,
  truncate,
  listUserFeedback,
  getFeedbackById,
  createFeedback,
  buildUserTicketHtml,
  buildAdminTicketHtml,
  notifyAdminsAboutFeedback,
};
