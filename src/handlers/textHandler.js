const {
  isAdminTelegramId,
  setProfitPercent,
  setUserBio,
  ensureUser,
  findUserByQuery,
} = require("../services/userService");
const { addProfitToUserByTelegramId } = require("../services/profitService");
const { setGlobalWorkerPercent, setUsdRubRate } = require("../services/settingsService");
const { addFormQuestion, getForm } = require("../services/formService");
const { adminQuestionsKeyboard } = require("../keyboards/application");
const { env } = require("../config/env");
const {
  getAvailableUsd,
  findAwaitingLinkForAdmin,
  completePayoutWithLink,
  normalizePayoutUrl,
  buildUserPayoutApprovedMessage,
  buildChannelMessageHtml,
  buildApprovedChannelSuffix,
} = require("../services/withdrawalService");
const { upsertBotMessage } = require("../utils/message");
const { pe } = require("../utils/emoji");
const { formatMemberCardHtml } = require("../utils/adminMemberCard");
const { getCurrencyContext } = require("../services/currencyService");
const {
  withdrawMethodKeyboard,
  walletAmountCancelKeyboard,
  settingsResultKeyboard,
} = require("../keyboards/common");
const {
  adminBackKeyboard,
  adminCancelKeyboard,
  adminResultKeyboard,
  memberActionKeyboard,
} = require("../keyboards/admin");

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function registerTextHandlers(bot) {
  bot.on("text", async (ctx, next) => {
    if (ctx.scene && ctx.scene.current) {
      return next();
    }

    if (ctx.session?.profileEditBio) {
      const text = (ctx.message.text || "").trim();
      try {
        await ctx.deleteMessage(ctx.message.message_id);
      } catch (_) {
        /* ignore */
      }
      const updated = await setUserBio(ctx.from.id, text);
      ctx.session.profileEditBio = null;
      await upsertBotMessage(
        ctx,
        `${pe("success")} Поле «О себе» обновлено.\nТекущее значение: ${updated?.bio || "Отсутствует"}`,
        { reply_markup: settingsResultKeyboard().reply_markup }
      );
      return;
    }

    if (ctx.session?.walletWithdraw?.step === "amount") {
      const user = await ensureUser(ctx.from);
      try {
        await ctx.deleteMessage(ctx.message.message_id);
      } catch (_) {
        /* ignore */
      }
      const raw = (ctx.message.text || "").trim().replace(/\s/g, "").replace(",", ".");
      const amount = Math.round(Number(raw) * 100) / 100;
      const minW = env.walletMinWithdrawalUsd;
      if (!Number.isFinite(amount) || amount < minW) {
        await upsertBotMessage(
          ctx,
          `${pe("error")} Введите сумму не меньше ${formatMoney(minW)} (число в $).`,
          { reply_markup: walletAmountCancelKeyboard().reply_markup }
        );
        return;
      }
      const available = await getAvailableUsd(user);
      if (amount - 1e-9 > available) {
        await upsertBotMessage(
          ctx,
          `${pe("error")} Недостаточно средств. Доступно: ${formatMoney(available)}`,
          { reply_markup: walletAmountCancelKeyboard().reply_markup }
        );
        return;
      }
      ctx.session.walletWithdraw = { step: "method", amount };
      await upsertBotMessage(
        ctx,
        `Сумма: <b>${formatMoney(amount)}</b>\n\nВыберите способ вывода:`,
        {
          reply_markup: withdrawMethodKeyboard().reply_markup,
        }
      );
      return;
    }

    const compose = ctx.session?.adminCompose;
    const text = ctx.message.text?.trim();
    const adminInput = ctx.session?.adminInput;
    const isAdmin = isAdminTelegramId(ctx.from.id);

    if (!compose && !adminInput && isAdmin) {
      const pendingPayout = await findAwaitingLinkForAdmin(ctx.from.id);
      if (pendingPayout) {
        const rawText = (ctx.message.text || "").trim();
        try {
          await ctx.deleteMessage(ctx.message.message_id);
        } catch (_) {
          /* ignore */
        }
        const norm = normalizePayoutUrl(rawText);
        if (!norm) {
          await upsertBotMessage(
            ctx,
            `${pe("error")} Нужна корректная ссылка, начинающаяся с https://`,
            { reply_markup: adminCancelKeyboard().reply_markup }
          );
          return;
        }
        try {
          const { request } = await completePayoutWithLink(
            pendingPayout._id,
            norm,
            ctx.from.id
          );
          const userHtml = buildUserPayoutApprovedMessage(norm);
          const sent = await ctx.telegram.sendMessage(request.telegramId, userHtml, {
            parse_mode: "HTML",
          });
          try {
            await ctx.telegram.pinChatMessage(request.telegramId, sent.message_id, {
              disable_notification: true,
            });
          } catch (_) {
            /* нет прав или пользователь отключил закрепления */
          }
          if (request.channelChatId && request.channelMessageId) {
            await ctx.telegram.editMessageText(
              request.channelChatId,
              Number(request.channelMessageId),
              undefined,
              buildChannelMessageHtml(request) + buildApprovedChannelSuffix(),
              { parse_mode: "HTML", reply_markup: { inline_keyboard: [] } }
            );
          }
          await upsertBotMessage(
            ctx,
            `${pe("success")} Пользователь получил ссылку, уведомление закреплено.`,
            { reply_markup: adminResultKeyboard().reply_markup }
          );
        } catch (e) {
          await upsertBotMessage(ctx, `${pe("error")} ${e.message}`, {
            reply_markup: adminBackKeyboard().reply_markup,
          });
        }
        return;
      }
    }

    if (!compose && !adminInput) return next();
    if (!isAdmin) {
      ctx.session.adminCompose = null;
      ctx.session.adminInput = null;
      return next();
    }

    try {
      await ctx.deleteMessage(ctx.message.message_id);
    } catch (_) {
      // Ignore: message can be non-deletable due to Telegram permissions.
    }

    if (!text) {
      const cancelBack =
        adminInput?.type === "search_user" ||
        adminInput?.type === "profit" ||
        adminInput?.type === "percent" ||
        compose
          ? "admin:users"
          : adminInput?.type === "global_percent" || adminInput?.type === "currency_rate"
            ? "admin:economy"
            : adminInput?.type === "app_question_label" ||
                adminInput?.type === "app_question_prompt"
              ? "admin:apps:questions"
              : "admin:panel";
      await upsertBotMessage(ctx, `${pe("error")} Пустое сообщение. Повторите ввод.`, {
        reply_markup: adminCancelKeyboard(cancelBack).reply_markup,
      });
      return;
    }

    if (adminInput?.type === "profit") {
      const amount = Number(text.replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0) {
        await upsertBotMessage(
          ctx,
          `${pe("error")} Введите корректную сумму профита (число больше 0).`,
          { reply_markup: adminCancelKeyboard("admin:users").reply_markup }
        );
        return;
      }

      const result = await addProfitToUserByTelegramId(
        adminInput.telegramId,
        amount,
        ctx.from.id
      );
      if (!result) {
        ctx.session.adminInput = null;
        await upsertBotMessage(ctx, `${pe("error")} Пользователь не найден.`, {
          reply_markup: adminBackKeyboard("admin:users").reply_markup,
        });
        return;
      }

      await ctx.telegram.sendMessage(
        result.user.telegramId,
        [
          `${pe("celebrate")} <b>Поздравляю вас с профитом!</b>`,
          "",
          `Общий профит: ${formatMoney(amount)}`,
          ` ┖ Твоя доля: ${formatMoney(result.workerShare)} (${result.user.profitPercent}%)`,
        ].join("\n"),
        { parse_mode: "HTML" }
      );

      await upsertBotMessage(
        ctx,
        `${pe("success")} Начислено ${formatMoney(amount)} пользователю <code>${result.user.telegramId}</code>.\nДоля воркера: ${formatMoney(result.workerShare)}.`,
        { reply_markup: adminResultKeyboard("admin:users").reply_markup }
      );
      ctx.session.adminInput = null;
      return;
    }

    if (adminInput?.type === "percent") {
      const percent = Number(text.replace("%", "").replace(",", "."));
      if (!Number.isFinite(percent) || percent < 1 || percent > 100) {
        await upsertBotMessage(
          ctx,
          `${pe("error")} Процент должен быть числом от 1 до 100.`,
          { reply_markup: adminCancelKeyboard("admin:users").reply_markup }
        );
        return;
      }

      const updatedUser = await setProfitPercent(adminInput.telegramId, percent);
      if (!updatedUser) {
        ctx.session.adminInput = null;
        await upsertBotMessage(ctx, `${pe("error")} Пользователь не найден.`, {
          reply_markup: adminBackKeyboard("admin:users").reply_markup,
        });
        return;
      }

      await upsertBotMessage(
        ctx,
        `${pe("success")} Процент воркера для <code>${updatedUser.telegramId}</code> обновлён: ${updatedUser.profitPercent}%.`,
        { reply_markup: adminResultKeyboard("admin:users").reply_markup }
      );
      ctx.session.adminInput = null;
      return;
    }

    if (adminInput?.type === "app_question_label") {
      if (text.length > 64) {
        await upsertBotMessage(
          ctx,
          `${pe("error")} Название слишком длинное (макс. 64).`,
          { reply_markup: adminCancelKeyboard("admin:apps:questions").reply_markup }
        );
        return;
      }
      ctx.session.adminInput = { type: "app_question_prompt", label: text };
      await upsertBotMessage(
        ctx,
        [
          `${pe("edit")} Название: <b>${text}</b>`,
          "",
          "Теперь отправьте <b>текст вопроса</b>, который увидит кандидат.",
        ].join("\n"),
        { reply_markup: adminCancelKeyboard("admin:apps:questions").reply_markup }
      );
      return;
    }

    if (adminInput?.type === "app_question_prompt") {
      if (text.length > 500) {
        await upsertBotMessage(
          ctx,
          `${pe("error")} Текст вопроса слишком длинный (макс. 500).`,
          { reply_markup: adminCancelKeyboard("admin:apps:questions").reply_markup }
        );
        return;
      }
      try {
        const question = await addFormQuestion("teamApplication", {
          label: adminInput.label,
          prompt: text,
        });
        ctx.session.adminInput = null;
        const form = await getForm("teamApplication");
        await upsertBotMessage(
          ctx,
          [
            `${pe("success")} Вопрос добавлен: <b>${question.label}</b>`,
            "",
            `Всего вопросов: <b>${form.questions.length}</b>`,
          ].join("\n"),
          { reply_markup: adminQuestionsKeyboard(form.questions).reply_markup }
        );
      } catch (error) {
        await upsertBotMessage(ctx, `${pe("error")} ${error.message}`, {
          reply_markup: adminCancelKeyboard("admin:apps:questions").reply_markup,
        });
      }
      return;
    }

    if (adminInput?.type === "global_percent") {
      const percent = Number(text.replace("%", "").replace(",", "."));
      if (!Number.isFinite(percent) || percent < 1 || percent > 100) {
        await upsertBotMessage(
          ctx,
          `${pe("error")} Глобальный процент должен быть числом от 1 до 100.`,
          { reply_markup: adminCancelKeyboard("admin:economy").reply_markup }
        );
        return;
      }
      const updated = await setGlobalWorkerPercent(percent);
      ctx.session.adminInput = null;
      await upsertBotMessage(
        ctx,
        `${pe("success")} Глобальный процент воркера обновлён: <b>${updated}%</b>\nПрименено ко всем пользователям.`,
        { reply_markup: adminResultKeyboard("admin:economy").reply_markup }
      );
      return;
    }

    if (adminInput?.type === "currency_rate") {
      const rate = Number(text.replace(",", ".").replace(/\s/g, ""));
      if (!Number.isFinite(rate) || rate <= 0) {
        await upsertBotMessage(
          ctx,
          `${pe("error")} Введите корректный курс (число больше 0).`,
          { reply_markup: adminCancelKeyboard("admin:economy").reply_markup }
        );
        return;
      }
      try {
        const updated = await setUsdRubRate(rate);
        ctx.session.adminInput = null;
        await upsertBotMessage(
          ctx,
          `${pe("success")} Курс обновлён: <b>1 USD = ${updated} RUB</b>`,
          { reply_markup: adminResultKeyboard("admin:economy").reply_markup }
        );
      } catch (e) {
        await upsertBotMessage(ctx, `${pe("error")} ${e.message}`, {
          reply_markup: adminCancelKeyboard("admin:economy").reply_markup,
        });
      }
      return;
    }

    if (adminInput?.type === "search_user") {
      const member = await findUserByQuery(text);
      if (!member) {
        await upsertBotMessage(ctx, `${pe("error")} Пользователь не найден. Введите @username или ID ещё раз.`, {
          reply_markup: adminCancelKeyboard("admin:panel").reply_markup,
        });
        return;
      }
      ctx.session.adminInput = null;
      const currencyCtx = await getCurrencyContext();
      await upsertBotMessage(ctx, formatMemberCardHtml(member, currencyCtx), {
        reply_markup: memberActionKeyboard(member.telegramId, member.isBanned).reply_markup,
      });
      return;
    }

    try {
      await ctx.telegram.sendMessage(
        compose.telegramId,
        `${pe("broadcast")} <b>Сообщение от администратора</b>\n\n${text}`,
        { parse_mode: "HTML" }
      );
      await upsertBotMessage(
        ctx,
        `${pe("success")} Сообщение отправлено пользователю <code>${compose.telegramId}</code>.`,
        { reply_markup: adminResultKeyboard().reply_markup }
      );
    } catch (error) {
      await upsertBotMessage(
        ctx,
        `${pe("error")} Не удалось отправить сообщение пользователю.`,
        { reply_markup: adminBackKeyboard().reply_markup }
      );
    } finally {
      ctx.session.adminCompose = null;
    }
  });
}

module.exports = { registerTextHandlers };
