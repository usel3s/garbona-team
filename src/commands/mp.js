const { getUserByTelegramId, ensureUser, isAdminTelegramId } = require("../services/userService");
const { getUserProfitStatsByTelegramId } = require("../services/profitService");
const { getCurrencyContext, formatDisplayAmount } = require("../services/currencyService");
const { pe } = require("../utils/emoji");

function displayNameFromTelegram(from) {
  const name = [from?.first_name, from?.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (from?.username) return `@${from.username}`;
  return `ID ${from?.id || "—"}`;
}

function roleLabelForUser(user) {
  if (!user) return "Не в боте";
  if (user.role === "admin") return "Администратор";
  if (user.isCurator) return "Куратор";
  if (user.isTeamMember) return "Воркер";
  if (user.isBanned) return "Заблокирован";
  return "Пользователь";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function buildMemberProfileHtml(targetFrom, dbUser, currencyCtx) {
  const title = escapeHtml(displayNameFromTelegram(targetFrom));
  const telegramId = String(targetFrom.id);
  const roleLabel = roleLabelForUser(dbUser);

  const daysWithTeam = dbUser?.createdAt
    ? Math.max(
        1,
        Math.floor((Date.now() - new Date(dbUser.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      )
    : null;

  const stats = dbUser
    ? await getUserProfitStatsByTelegramId(dbUser.telegramId, "all")
    : null;
  const totalProfit = stats ? stats.periodProfit : 0;
  const operationsCount = stats ? stats.operationsCount : 0;
  const avgProfit = operationsCount > 0 ? totalProfit / operationsCount : 0;

  const lines = [
    `${pe("profile")} <b>${title}</b>`,
    ` ┖ Статус: ${roleLabel}`,
  ];

  if (dbUser?.curatorTelegramId && !dbUser.isCurator) {
    const bound = await getUserByTelegramId(dbUser.curatorTelegramId);
    const curatorLabel = bound?.username
      ? `@${escapeHtml(bound.username)}`
      : `<code>${escapeHtml(dbUser.curatorTelegramId)}</code>`;
    lines.push(` ┖ Куратор: ${curatorLabel}`);
  }

  lines.push("");
  lines.push(`${pe("statistics")} <b>Статистика:</b>`);

  if (operationsCount > 0) {
    lines.push(
      ` ┖ ${operationsCount} профит${operationsCount === 1 ? "" : "а"} на сумму: ${formatDisplayAmount(totalProfit, currencyCtx)}`
    );
    lines.push(` ┖ Средний профит: ${formatDisplayAmount(avgProfit, currencyCtx)}`);
  } else {
    lines.push(" ┖ Профиты отсутствуют.");
  }

  lines.push("");
  lines.push(`О себе: ${escapeHtml(dbUser?.bio || "Отсутствует")}`);

  if (daysWithTeam != null) {
    lines.push("");
    lines.push(`${pe("users")} С нами: ${daysWithTeam} дн.`);
  }

  lines.push("");
  lines.push(`${pe("info")} ID: <code>${escapeHtml(telegramId)}</code>`);

  return lines.join("\n");
}

function registerMpCommand(bot) {
  bot.command("mp", async (ctx) => {
    const caller = await ensureUser(ctx.from);
    const allowed =
      isAdminTelegramId(ctx.from.id) ||
      caller.role === "admin" ||
      caller.isTeamMember;
    if (!allowed) {
      await ctx.reply(`${pe("error")} Команда доступна участникам команды.`, {
        parse_mode: "HTML",
      });
      return;
    }

    const replied = ctx.message?.reply_to_message?.from;
    if (!replied || replied.is_bot) {
      await ctx.reply(
        `${pe("info")} Ответьте командой <code>/mp</code> на сообщение пользователя.`,
        { parse_mode: "HTML" }
      );
      return;
    }

    const dbUser = await getUserByTelegramId(replied.id);
    const currencyCtx = await getCurrencyContext();
    const html = await buildMemberProfileHtml(replied, dbUser, currencyCtx);
    await ctx.reply(html, {
      parse_mode: "HTML",
      reply_to_message_id: ctx.message.message_id,
    });
  });
}

module.exports = { registerMpCommand, buildMemberProfileHtml };
