const Application = require("../models/Application");
const { env } = require("../config/env");
const { moderatorApplicationKeyboard } = require("../keyboards/application");
const { getForm } = require("./formService");
const { pe } = require("../utils/emoji");
const { logger } = require("../utils/logger");
const { setTeamMember } = require("./userService");
const { acceptedStartKeyboard, homeOnlyKeyboard } = require("../keyboards/common");

const PAGE_SIZE = 5;

function buildApplicationChannelText(user, answers, form) {
  const lines = [
    `${pe("notification")} <b>Новая заявка в команду</b>`,
    "",
    `<b>User ID:</b> <code>${user.telegramId}</code>`,
    `<b>Username:</b> @${user.username || "unknown"}`,
    "",
  ];
  for (const q of form.questions) {
    lines.push(`<b>${q.label}:</b> ${answers[q.key] || "-"}`);
  }
  // ответы на удалённые/кастомные ключи тоже показать
  const known = new Set(form.questions.map((q) => q.key));
  for (const [key, value] of Object.entries(answers || {})) {
    if (!known.has(key) && value) {
      lines.push(`<b>${key}:</b> ${value}`);
    }
  }
  return lines.join("\n");
}

async function formatApplicationCard(application, form) {
  const user = application.userId;
  const statusMap = {
    pending: "На рассмотрении",
    accepted: "Принята",
    rejected: "Отклонена",
  };
  const answers = application.answers || {};
  const lines = [
    `${pe("notification")} <b>Заявка</b> <code>${application._id}</code>`,
    "",
    `<b>Статус:</b> ${statusMap[application.status] || application.status}`,
    `<b>ID:</b> <code>${user?.telegramId || "—"}</code>`,
    `<b>Username:</b> @${user?.username || "unknown"}`,
    `<b>Создана:</b> ${new Date(application.createdAt).toLocaleString("ru-RU")}`,
    "",
  ];

  const known = new Set((form?.questions || []).map((q) => q.key));
  for (const q of form?.questions || []) {
    lines.push(`<b>${q.label}:</b> ${answers[q.key] || "—"}`);
  }
  for (const [key, value] of Object.entries(answers)) {
    if (!known.has(key) && value) {
      lines.push(`<b>${key}:</b> ${value}`);
    }
  }

  if (!application.channelMessageId) {
    lines.push("");
    lines.push(`${pe("info")} <i>Не отправлена в канал модерации</i>`);
  }

  return lines.join("\n");
}

async function createAndSendApplication(ctx, user, formId, answers) {
  const form = await getForm(formId);
  const application = await Application.create({
    userId: user._id,
    formId,
    answers,
    status: "pending",
  });

  try {
    const message = await ctx.telegram.sendMessage(
      env.applicationsChannelId,
      buildApplicationChannelText(user, answers, form),
      {
        parse_mode: "HTML",
        reply_markup: moderatorApplicationKeyboard(application._id.toString()).reply_markup,
      }
    );
    application.channelMessageId = String(message.message_id);
    await application.save();
  } catch (error) {
    logger.warn(
      "Application saved but channel send failed",
      application._id.toString(),
      error.message
    );
  }

  return application;
}

async function getPendingApplicationById(applicationId) {
  return Application.findById(applicationId).populate("userId");
}

async function getApplicationById(applicationId) {
  return Application.findById(applicationId).populate("userId");
}

async function updateApplicationStatus(applicationId, status, moderatorId) {
  return Application.findByIdAndUpdate(
    applicationId,
    { status, moderatorId: String(moderatorId) },
    { new: true }
  ).populate("userId");
}

async function listApplications({ status, statuses, page = 0 } = {}) {
  const filter = {};
  if (status) filter.status = status;
  else if (statuses?.length) filter.status = { $in: statuses };

  const skip = Math.max(0, page) * PAGE_SIZE;
  const [items, total] = await Promise.all([
    Application.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(PAGE_SIZE)
      .populate("userId", "telegramId username")
      .lean(),
    Application.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/**
 * Принять / отклонить заявку. Возвращает updated или null если уже обработана.
 */
async function decideApplication(telegram, applicationId, action, moderator) {
  const application = await getPendingApplicationById(applicationId);
  if (!application || application.status !== "pending") {
    return { ok: false, reason: "already_processed" };
  }

  const newStatus = action === "accept" ? "accepted" : "rejected";
  const updated = await updateApplicationStatus(applicationId, newStatus, moderator.id);

  if (action === "accept") {
    await setTeamMember(updated.userId.telegramId, true);
  }

  try {
    if (action === "accept") {
      await telegram.sendMessage(
        updated.userId.telegramId,
        [
          `${pe("celebrate")} <b>Заявка принята!</b>`,
          "",
          "Добро пожаловать в команду Garbona.",
          "Нажми кнопку ниже, чтобы открыть меню.",
        ].join("\n"),
        {
          parse_mode: "HTML",
          reply_markup: acceptedStartKeyboard().reply_markup,
        }
      );
    } else {
      await telegram.sendMessage(
        updated.userId.telegramId,
        `${pe("error")} К сожалению, твоя заявка была отклонена.`,
        {
          parse_mode: "HTML",
          reply_markup: homeOnlyKeyboard().reply_markup,
        }
      );
    }
  } catch (error) {
    logger.warn("Failed to notify applicant", updated.userId.telegramId, error.message);
  }

  if (!application.channelMessageId) {
    return { ok: true, updated, action };
  }

  try {
    const { env } = require("../config/env");
    const { btn } = require("../utils/emoji");
    const moderatorName = moderator.first_name || moderator.username || "Admin";
    const resultLabel =
      action === "accept" ? `Принял: ${moderatorName}` : `Отклонил: ${moderatorName}`;
    await telegram.editMessageReplyMarkup(
      env.applicationsChannelId,
      Number(application.channelMessageId),
      undefined,
      {
        inline_keyboard: [
          [
            btn(
              resultLabel,
              "moderate:done",
              action === "accept" ? "success" : "error"
            ),
          ],
        ],
      }
    );
  } catch (error) {
    logger.warn("Failed to update channel application message", error.message);
  }

  return { ok: true, updated, action };
}

module.exports = {
  PAGE_SIZE,
  buildApplicationChannelText,
  formatApplicationCard,
  createAndSendApplication,
  getPendingApplicationById,
  getApplicationById,
  updateApplicationStatus,
  listApplications,
  decideApplication,
};
