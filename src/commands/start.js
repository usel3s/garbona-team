const { applicationStartKeyboard, participantPanelKeyboard, homeOnlyKeyboard } = require("../keyboards/common");
const { upsertBotMessage } = require("../utils/message");
const { ensureUser } = require("../services/userService");
const { getApplicationSubmitGate } = require("../services/applicationService");
const { renderPublicProfile } = require("./top");
const { pe } = require("../utils/emoji");
const { clearPendingInputs } = require("../utils/session");
const { renderFeedbackMenu } = require("./feedback");

async function renderHome(ctx) {
  const user = await ensureUser(ctx.from);
  if (user.isBanned) {
    return upsertBotMessage(
      ctx,
      `${pe("userBlocked")} Ты заблокирован. Доступ ограничен.`
    );
  }

  if (!user.isTeamMember) {
    const gate = await getApplicationSubmitGate(user);
    if (!gate.allowed) {
      return upsertBotMessage(ctx, gate.message, {
        reply_markup: homeOnlyKeyboard().reply_markup,
      });
    }

    return upsertBotMessage(
      ctx,
      [
        `${pe("bot")} <b>Garbona</b>`,
        "",
        "Добро пожаловать!",
        "Чтобы начать работу с нами — подай заявку.",
      ].join("\n"),
      { reply_markup: applicationStartKeyboard().reply_markup }
    );
  }

  return upsertBotMessage(
    ctx,
    [
      `${pe("home")} <b>Главное меню</b>`,
      "",
      "Выбери раздел ниже.",
    ].join("\n"),
    { reply_markup: participantPanelKeyboard(user.role === "admin").reply_markup }
  );
}

function registerStartCommand(bot) {
  bot.start(async (ctx) => {
    if (ctx.scene?.current) {
      try {
        await ctx.scene.leave();
      } catch (_) {
        // Scene may already be inactive.
      }
    }

    if (ctx.scene?.session?.formState) {
      ctx.scene.session.formState = null;
    }

    clearPendingInputs(ctx);

    const payload = String(ctx.startPayload || "").trim();
    if (/^(feedback|fb)$/i.test(payload)) {
      await renderFeedbackMenu(ctx);
      return;
    }

    const profileMatch = /^u_(\d+)(?:_(all|24h|7d|30d))?$/.exec(payload);
    if (profileMatch) {
      const period = profileMatch[2] || "all";
      await renderPublicProfile(ctx, profileMatch[1], "all", {
        back: period === "all" ? "menu:top_workers" : `top:period:${period}`,
      });
      return;
    }

    await renderHome(ctx);
  });
}

module.exports = { registerStartCommand, renderHome };
