const { pe } = require("./emoji");
const { formatDisplayAmount } = require("../services/currencyService");

function formatMemberCardHtml(member, currencyCtx) {
  return [
    `${pe("profile")} <b>Управление пользователем</b>`,
    `<b>ID:</b> <code>${member.telegramId}</code>`,
    `<b>Username:</b> @${member.username || "unknown"}`,
    `<b>Роль:</b> ${member.role}`,
    `<b>В команде:</b> ${member.isTeamMember ? "Да" : "Нет"}`,
    `<b>Заблокирован:</b> ${member.isBanned ? "Да" : "Нет"}`,
    `<b>Профиты:</b> ${formatDisplayAmount(member.totalProfit || 0, currencyCtx)}`,
    `<b>Процент:</b> ${member.profitPercent}%`,
  ].join("\n");
}

module.exports = { formatMemberCardHtml };
