const {
  isAdminTelegramId,
  setProfitPercent,
  setUserBio,
  ensureUser,
  findUserByQuery,
  getUserByTelegramId,
  addWalletBalanceUsd,
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
  payoutApprovedUserKeyboard,
  buildChannelMessageHtml,
  buildApprovedChannelSuffix,
  buildWithdrawConfirmHtml,
  validateWalletAddress,
  methodLabel,
} = require("../services/withdrawalService");
const { upsertBotMessage } = require("../utils/message");
const { pe } = require("../utils/emoji");
const { clearPendingInputs, isBotCommandText } = require("../utils/session");
const { formatMemberCardHtml } = require("../utils/adminMemberCard");
const { getCurrencyContext } = require("../services/currencyService");
const {
  walletAmountCancelKeyboard,
  withdrawConfirmKeyboard,
  settingsResultKeyboard,
} = require("../keyboards/common");
const {
  adminBackKeyboard,
  adminCancelKeyboard,
  adminResultKeyboard,
  memberActionKeyboard,
} = require("../keyboards/admin");
const {
  bindWorkerPanelAccount,
  parsePanelCredentialsInput,
} = require("../services/panelAccountService");
const { formatPanelError } = require("../services/apiService");
const { sendFakeSteamProfit, sendFakeSteamLog } = require("../services/steamMonitorService");
const { resolveFakeProfitSevenSkinQueries } = require("../services/steamMarketLookup");
const { FAKE_STEAM_PROFIT_SKINS_INSTRUCTION_HTML } = require("../utils/fakeSteamProfitInput");
const {
  FAKE_STEAM_LOG_INSTRUCTION_HTML,
  parseFakeSteamLogInput,
} = require("../utils/fakeSteamLogInput");
const { updateCuratorSettings } = require("../services/curatorService");
const { updateCallerSettings } = require("../services/callerService");

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function registerTextHandlers(bot) {
  bot.on("text", async (ctx, next) => {
    if (ctx.scene && ctx.scene.current) {
      return next();
    }

    const incoming = String(ctx.message?.text || "").trim();
    if (isBotCommandText(incoming)) {
      clearPendingInputs(ctx);
      return next();
    }

    if (ctx.session?.profileEditBio) {
      const text = incoming;
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

    if (ctx.session?.walletWithdraw?.step === "address") {
      const st = ctx.session.walletWithdraw;
      try {
        await ctx.deleteMessage(ctx.message.message_id);
      } catch (_) {
        /* ignore */
      }
      const check = validateWalletAddress(st.method, incoming);
      if (!check.ok) {
        await upsertBotMessage(
          ctx,
          [
            `${pe("error")} ${check.error}`,
            "",
            `Сеть: <b>${methodLabel(st.method)}</b>`,
            "Введите адрес кошелька ещё раз.",
          ].join("\n"),
          { reply_markup: walletAmountCancelKeyboard().reply_markup }
        );
        return;
      }

      const user = await ensureUser(ctx.from);
      const available = await getAvailableUsd(user);
      const minW = env.walletMinWithdrawalUsd;
      ctx.session.walletWithdraw = {
        step: "amount",
        method: st.method,
        address: check.address,
      };
      await upsertBotMessage(
        ctx,
        [
          `${pe("transfer")} <b>Сумма вывода</b>`,
          "",
          `Сеть: <b>${methodLabel(st.method)}</b>`,
          `Кошелёк: <code>${check.address}</code>`,
          "",
          `Доступно: <b>${formatMoney(available)}</b>`,
          `Минимум: <b>${formatMoney(minW)}</b>`,
          "",
          "Введите сумму в <b>долларах США ($)</b>.",
        ].join("\n"),
        { reply_markup: walletAmountCancelKeyboard().reply_markup }
      );
      return;
    }

    if (ctx.session?.walletWithdraw?.step === "amount") {
      const st = ctx.session.walletWithdraw;
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

      ctx.session.walletWithdraw = {
        step: "confirm",
        method: st.method,
        address: st.address,
        amount,
      };
      await upsertBotMessage(
        ctx,
        buildWithdrawConfirmHtml({
          method: st.method,
          address: st.address,
          amountUsd: amount,
        }),
        { reply_markup: withdrawConfirmKeyboard().reply_markup }
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
          const userHtml = buildUserPayoutApprovedMessage();
          const sent = await ctx.telegram.sendMessage(request.telegramId, userHtml, {
            parse_mode: "HTML",
            reply_markup: payoutApprovedUserKeyboard(norm).reply_markup,
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
        adminInput?.type === "wallet_topup" ||
        adminInput?.type === "percent" ||
        adminInput?.type === "panel_bind" ||
        compose
          ? "admin:users"
          : adminInput?.type === "global_percent" ||
              adminInput?.type === "currency_rate" ||
              adminInput?.type === "fake_profit_owner" ||
              adminInput?.type === "fake_profit_skins" ||
              adminInput?.type === "fake_log_owner" ||
              adminInput?.type === "fake_log_fields"
            ? "admin:economy"
            : adminInput?.type === "curator_desc" ||
                adminInput?.type === "curator_percent" ||
                adminInput?.type === "curator_min_profits" ||
                adminInput?.type === "caller_desc" ||
                adminInput?.type === "caller_percent" ||
                adminInput?.type === "caller_min_profits"
              ? `admin:member:${adminInput.telegramId}`
            : adminInput?.type === "app_question_label" ||
                adminInput?.type === "app_question_prompt"
              ? "admin:apps:questions"
              : "admin:panel";
      await upsertBotMessage(ctx, `${pe("error")} Пустое сообщение. Повторите ввод.`, {
        reply_markup: adminCancelKeyboard(cancelBack).reply_markup,
      });
      return;
    }

    if (adminInput?.type === "panel_bind") {
      const parsed = parsePanelCredentialsInput(text);
      if (!parsed) {
        await upsertBotMessage(
          ctx,
          `${pe("error")} Формат: <code>логин:пароль</code>`,
          { reply_markup: adminCancelKeyboard(`admin:panelacc:${adminInput.telegramId}`).reply_markup }
        );
        return;
      }
      const member = await getUserByTelegramId(adminInput.telegramId);
      if (!member) {
        ctx.session.adminInput = null;
        await upsertBotMessage(ctx, `${pe("error")} Пользователь не найден.`, {
          reply_markup: adminBackKeyboard("admin:users").reply_markup,
        });
        return;
      }
      try {
        await bindWorkerPanelAccount(member, parsed.username, parsed.password);
        ctx.session.adminInput = null;
        const currencyCtx = await getCurrencyContext();
        await upsertBotMessage(
          ctx,
          `${pe("success")} Аккаунт сайтов привязан.\n\n${formatMemberCardHtml(member, currencyCtx)}`,
          { reply_markup: memberActionKeyboard(member.telegramId, member.isBanned, member.isCurator, member.isCaller, member.isModerator).reply_markup }
        );
      } catch (error) {
        await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`, {
          reply_markup: adminCancelKeyboard(`admin:panelacc:${adminInput.telegramId}`).reply_markup,
        });
      }
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

    if (adminInput?.type === "wallet_topup") {
      const amount = Math.round(Number(String(text).replace(",", ".").replace(/\s/g, "")) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0) {
        await upsertBotMessage(
          ctx,
          `${pe("error")} Введите сумму в долларах (число больше 0).`,
          { reply_markup: adminCancelKeyboard(`admin:member:${adminInput.telegramId}`).reply_markup }
        );
        return;
      }

      try {
        const { user, amountUsd } = await addWalletBalanceUsd(adminInput.telegramId, amount);
        try {
          await ctx.telegram.sendMessage(
            user.telegramId,
            [
              `${pe("wallet")} <b>Кошелёк пополнен</b>`,
              "",
              `Сумма: <b>${formatMoney(amountUsd)}</b>`,
              `Баланс: <b>${formatMoney(user.totalProfit)}</b>`,
            ].join("\n"),
            { parse_mode: "HTML" }
          );
        } catch (_) {
          /* ignore */
        }

        await upsertBotMessage(
          ctx,
          [
            `${pe("success")} Кошелёк пополнен на <b>${formatMoney(amountUsd)}</b>.`,
            `Пользователь: <code>${user.telegramId}</code>`,
            `Баланс: <b>${formatMoney(user.totalProfit)}</b>`,
          ].join("\n"),
          {
            reply_markup: memberActionKeyboard(
              user.telegramId, user.isBanned, user.isCurator, user.isCaller, user.isModerator).reply_markup,
          }
        );
      } catch (e) {
        await upsertBotMessage(ctx, `${pe("error")} ${e.message}`, {
          reply_markup: adminCancelKeyboard(`admin:member:${adminInput.telegramId}`).reply_markup,
        });
        return;
      }
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

    if (adminInput?.type === "curator_desc") {
      if (text.length > 500) {
        await upsertBotMessage(ctx, `${pe("error")} Описание слишком длинное (макс. 500).`, {
          reply_markup: adminCancelKeyboard(`admin:member:${adminInput.telegramId}`).reply_markup,
        });
        return;
      }
      try {
        await updateCuratorSettings(adminInput.telegramId, { description: text });
      } catch (error) {
        await upsertBotMessage(ctx, `${pe("error")} ${error.message}`, {
          reply_markup: adminCancelKeyboard(`admin:member:${adminInput.telegramId}`).reply_markup,
        });
        return;
      }
      ctx.session.adminInput = { type: "curator_percent", telegramId: adminInput.telegramId };
      await upsertBotMessage(
        ctx,
        `${pe("success")} Описание сохранено.\n\n${pe("analytics")} Введите <b>процент</b> куратора (1–100).`,
        { reply_markup: adminCancelKeyboard(`admin:member:${adminInput.telegramId}`).reply_markup }
      );
      return;
    }

    if (adminInput?.type === "curator_percent") {
      const percent = Number(text.replace("%", "").replace(",", "."));
      try {
        await updateCuratorSettings(adminInput.telegramId, { percent });
      } catch (error) {
        await upsertBotMessage(ctx, `${pe("error")} ${error.message}`, {
          reply_markup: adminCancelKeyboard(`admin:member:${adminInput.telegramId}`).reply_markup,
        });
        return;
      }
      ctx.session.adminInput = { type: "curator_min_profits", telegramId: adminInput.telegramId };
      await upsertBotMessage(
        ctx,
        `${pe("success")} Процент сохранён: <b>${percent}%</b>\n\n${pe("statistics")} Введите <b>обязательное количество профитов</b> для заявки (целое число ≥ 0).`,
        { reply_markup: adminCancelKeyboard(`admin:member:${adminInput.telegramId}`).reply_markup }
      );
      return;
    }

    if (adminInput?.type === "curator_min_profits") {
      const minProfits = Number(text.replace(",", "."));
      try {
        if (!Number.isInteger(minProfits)) throw new Error("Введите целое число.");
        await updateCuratorSettings(adminInput.telegramId, { minProfits });
      } catch (error) {
        await upsertBotMessage(ctx, `${pe("error")} ${error.message}`, {
          reply_markup: adminCancelKeyboard(`admin:member:${adminInput.telegramId}`).reply_markup,
        });
        return;
      }
      const member = await getUserByTelegramId(adminInput.telegramId);
      ctx.session.adminInput = null;
      const currencyCtx = await getCurrencyContext();
      await upsertBotMessage(
        ctx,
        `${pe("success")} Настройки куратора сохранены.\n\n${formatMemberCardHtml(member, currencyCtx)}`,
        {
          reply_markup: memberActionKeyboard(
            member.telegramId, member.isBanned, member.isCurator, member.isCaller, member.isModerator).reply_markup,
        }
      );
      return;
    }

    if (adminInput?.type === "caller_desc") {
      if (text.length > 500) {
        await upsertBotMessage(ctx, `${pe("error")} Описание слишком длинное (макс. 500).`, {
          reply_markup: adminCancelKeyboard(`admin:member:${adminInput.telegramId}`).reply_markup,
        });
        return;
      }
      try {
        await updateCallerSettings(adminInput.telegramId, { description: text });
      } catch (error) {
        await upsertBotMessage(ctx, `${pe("error")} ${error.message}`, {
          reply_markup: adminCancelKeyboard(`admin:member:${adminInput.telegramId}`).reply_markup,
        });
        return;
      }
      ctx.session.adminInput = { type: "caller_percent", telegramId: adminInput.telegramId };
      await upsertBotMessage(
        ctx,
        `${pe("success")} Описание сохранено.\n\n${pe("analytics")} Введите <b>процент</b> прозвонщицы (1–100).`,
        { reply_markup: adminCancelKeyboard(`admin:member:${adminInput.telegramId}`).reply_markup }
      );
      return;
    }

    if (adminInput?.type === "caller_percent") {
      const percent = Number(text.replace("%", "").replace(",", "."));
      try {
        await updateCallerSettings(adminInput.telegramId, { percent });
      } catch (error) {
        await upsertBotMessage(ctx, `${pe("error")} ${error.message}`, {
          reply_markup: adminCancelKeyboard(`admin:member:${adminInput.telegramId}`).reply_markup,
        });
        return;
      }
      ctx.session.adminInput = { type: "caller_min_profits", telegramId: adminInput.telegramId };
      await upsertBotMessage(
        ctx,
        `${pe("success")} Процент сохранён: <b>${percent}%</b>\n\n${pe("statistics")} Введите <b>обязательное количество профитов</b> для заявки (целое число ≥ 0).`,
        { reply_markup: adminCancelKeyboard(`admin:member:${adminInput.telegramId}`).reply_markup }
      );
      return;
    }

    if (adminInput?.type === "caller_min_profits") {
      const minProfits = Number(text.replace(",", "."));
      try {
        if (!Number.isInteger(minProfits)) throw new Error("Введите целое число.");
        await updateCallerSettings(adminInput.telegramId, { minProfits });
      } catch (error) {
        await upsertBotMessage(ctx, `${pe("error")} ${error.message}`, {
          reply_markup: adminCancelKeyboard(`admin:member:${adminInput.telegramId}`).reply_markup,
        });
        return;
      }
      const member = await getUserByTelegramId(adminInput.telegramId);
      ctx.session.adminInput = null;
      const currencyCtx = await getCurrencyContext();
      await upsertBotMessage(
        ctx,
        `${pe("success")} Настройки прозвонщицы сохранены.\n\n${formatMemberCardHtml(member, currencyCtx)}`,
        {
          reply_markup: memberActionKeyboard(
            member.telegramId, member.isBanned, member.isCurator, member.isCaller, member.isModerator).reply_markup,
        }
      );
      return;
    }

    if (adminInput?.type === "fake_profit_owner") {
      const member = await findUserByQuery(text);
      if (!member) {
        await upsertBotMessage(ctx, `${pe("error")} Участник не найден. Укажите ID или @username.`, {
          reply_markup: adminCancelKeyboard("admin:economy").reply_markup,
        });
        return;
      }
      ctx.session.adminInput = {
        type: "fake_profit_skins",
        attribution: "user",
        ownerTelegramId: member.telegramId,
      };
      await upsertBotMessage(ctx, `${pe("success")} Участник: <code>${member.telegramId}</code>\n\n${FAKE_STEAM_PROFIT_SKINS_INSTRUCTION_HTML}`, {
        reply_markup: adminCancelKeyboard("admin:economy").reply_markup,
      });
      return;
    }

    if (adminInput?.type === "fake_profit_skins") {
      await upsertBotMessage(ctx, `${pe("loading")} Запрашиваю Steam Market. Это может занять до 30 секунд.`);
      try {
        const parsed = await resolveFakeProfitSevenSkinQueries(text);
        if (parsed.error) {
          await upsertBotMessage(ctx, `${pe("error")} ${parsed.error}`, {
            reply_markup: adminCancelKeyboard("admin:economy").reply_markup,
          });
          return;
        }
        await sendFakeSteamProfit(bot, {
          items: parsed.items,
          total: parsed.total,
          anonymous: adminInput.attribution === "anon",
          ownerTelegramId: adminInput.ownerTelegramId,
        });
        ctx.session.adminInput = null;
        await upsertBotMessage(ctx, `${pe("success")} Фейк-профит отправлен. Сумма: <b>$${parsed.total.toFixed(2)}</b>.`, {
          reply_markup: adminResultKeyboard("admin:economy").reply_markup,
        });
      } catch (error) {
        await upsertBotMessage(ctx, `${pe("error")} ${error.message}`, {
          reply_markup: adminCancelKeyboard("admin:economy").reply_markup,
        });
      }
      return;
    }

    if (adminInput?.type === "fake_log_owner") {
      const member = await findUserByQuery(text);
      if (!member) {
        await upsertBotMessage(ctx, `${pe("error")} Участник не найден. Укажите ID или @username.`, {
          reply_markup: adminCancelKeyboard("admin:economy").reply_markup,
        });
        return;
      }
      ctx.session.adminInput = {
        type: "fake_log_fields",
        ownerTelegramId: member.telegramId,
      };
      await upsertBotMessage(
        ctx,
        `${pe("success")} Участник: <code>${member.telegramId}</code>\n\n${FAKE_STEAM_LOG_INSTRUCTION_HTML}`,
        { reply_markup: adminCancelKeyboard("admin:economy").reply_markup }
      );
      return;
    }

    if (adminInput?.type === "fake_log_fields") {
      const parsed = parseFakeSteamLogInput(text);
      if (parsed.error) {
        await upsertBotMessage(ctx, `${pe("error")} ${parsed.error}`, {
          reply_markup: adminCancelKeyboard("admin:economy").reply_markup,
        });
        return;
      }
      try {
        const ownerTelegramId = adminInput.ownerTelegramId;
        await sendFakeSteamLog(bot, {
          account: parsed.account,
          ownerTelegramId,
        });
        ctx.session.adminInput = null;
        await upsertBotMessage(
          ctx,
          `${pe("success")} Фейк-лог отправлен в ЛС <code>${ownerTelegramId}</code>.`,
          { reply_markup: adminResultKeyboard("admin:economy").reply_markup }
        );
      } catch (error) {
        await upsertBotMessage(ctx, `${pe("error")} ${error.message}`, {
          reply_markup: adminCancelKeyboard("admin:economy").reply_markup,
        });
      }
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
        reply_markup: memberActionKeyboard(member.telegramId, member.isBanned, member.isCurator, member.isCaller, member.isModerator).reply_markup,
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
