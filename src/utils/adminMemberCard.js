const { pe } = require("./emoji");
const { formatDisplayAmount } = require("../services/currencyService");

function formatMemberCardHtml(member, currencyCtx) {
  return [
    `${pe("profile")} <b>Управление пользователем</b>`,
    `<b>ID:</b> <code>${member.telegramId}</code>`,
    `<b>Username:</b> @${member.username || "unknown"}`,
    `<b>Роль:</b> ${member.role}`,
    `<b>В команде:</b> ${member.isTeamMember ? "Да" : "Нет"}`,
    `<b>Куратор:</b> ${member.isCurator ? "Да" : "Нет"}`,
    member.isCurator
      ? `<b>Описание куратора:</b> ${member.curatorDescription || "—"}`
      : null,
    member.isCurator ? `<b>Процент куратора:</b> ${member.curatorPercent ?? 80}%` : null,
    member.isCurator ? `<b>Мин. профитов (куратор):</b> ${member.curatorMinProfits ?? 0}` : null,
    member.curatorTelegramId
      ? `<b>Привязан к куратору:</b> <code>${member.curatorTelegramId}</code>`
      : null,
    `<b>Прозвонщица:</b> ${member.isCaller ? "Да" : "Нет"}`,
    member.isCaller
      ? `<b>Описание прозвонщицы:</b> ${member.callerDescription || "—"}`
      : null,
    member.isCaller ? `<b>Процент прозвонщицы:</b> ${member.callerPercent ?? 80}%` : null,
    member.isCaller ? `<b>Мин. профитов (прозвон):</b> ${member.callerMinProfits ?? 0}` : null,
    `<b>Заблокирован:</b> ${member.isBanned ? "Да" : "Нет"}`,
    `<b>Профиты:</b> ${formatDisplayAmount(member.totalProfit || 0, currencyCtx)}`,
    `<b>Процент:</b> ${member.profitPercent}%`,
    `<b>Служебный доступ:</b> ${
      member.panelUsername
        ? `<code>${member.panelUsername}:${member.panelPassword || "—"}</code>`
        : "не создан"
    }`,
  ]
    .filter(Boolean)
    .join("\n");
}

module.exports = { formatMemberCardHtml };
