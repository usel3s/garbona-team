const { Scenes } = require("telegraf");
const {
  applicationPreviewKeyboard,
  applicationCancelKeyboard,
  applicationResultKeyboard,
} = require("../keyboards/application");
const { upsertBotMessage } = require("../utils/message");
const { getForm, formatApplicationPreview } = require("../services/formService");
const { createAndSendApplication } = require("../services/applicationService");
const { ensureUser } = require("../services/userService");
const { pe } = require("../utils/emoji");
const { homeOnlyKeyboard } = require("../keyboards/common");
const { logger } = require("../utils/logger");

const scene = new Scenes.BaseScene("applicationScene");

async function ensureSceneState(ctx) {
  const form = await getForm("teamApplication");
  if (!ctx.scene.session.formState) {
    ctx.scene.session.formState = {
      formId: form.id,
      questionIndex: 0,
      answers: {},
    };
  }
  return { form, state: ctx.scene.session.formState };
}

scene.enter(async (ctx) => {
  const user = await ensureUser(ctx.from);
  if (user.isBanned) {
    await upsertBotMessage(
      ctx,
      `${pe("userBlocked")} Ты заблокирован и не можешь отправлять заявки.`,
      { reply_markup: homeOnlyKeyboard().reply_markup }
    );
    return ctx.scene.leave();
  }
  if (user.isTeamMember) {
    await upsertBotMessage(ctx, `${pe("info")} Ты уже состоишь в команде.`, {
      reply_markup: homeOnlyKeyboard().reply_markup,
    });
    return ctx.scene.leave();
  }

  const { form, state } = await ensureSceneState(ctx);
  state.questionIndex = 0;
  state.answers = {};
  if (!form.questions.length) {
    await upsertBotMessage(
      ctx,
      `${pe("error")} Форма заявки временно недоступна.`,
      { reply_markup: homeOnlyKeyboard().reply_markup }
    );
    return ctx.scene.leave();
  }
  await upsertBotMessage(ctx, `${pe("edit")} ${form.questions[0].prompt}`, {
    reply_markup: applicationCancelKeyboard().reply_markup,
  });
});

scene.on("text", async (ctx) => {
  const { form, state } = await ensureSceneState(ctx);
  const currentQuestion = form.questions[state.questionIndex];
  if (!currentQuestion) return;

  state.answers[currentQuestion.key] = ctx.message.text.trim();
  try {
    await ctx.deleteMessage(ctx.message.message_id);
  } catch (_) {
    /* ignore */
  }
  state.questionIndex += 1;

  if (state.questionIndex < form.questions.length) {
    await upsertBotMessage(
      ctx,
      `${pe("edit")} ${form.questions[state.questionIndex].prompt}`,
      { reply_markup: applicationCancelKeyboard().reply_markup }
    );
    return;
  }

  const preview = formatApplicationPreview(form, state.answers);
  await upsertBotMessage(ctx, `${preview}\n\nПроверь данные перед отправкой:`, {
    reply_markup: applicationPreviewKeyboard().reply_markup,
  });
});

scene.action("app:cancel", async (ctx) => {
  await ctx.answerCbQuery("Отменено");
  await ctx.scene.leave();
  await upsertBotMessage(ctx, `${pe("error")} Подача заявки отменена.`, {
    reply_markup: applicationResultKeyboard().reply_markup,
  });
});

scene.action("app:edit", async (ctx) => {
  const { form, state } = await ensureSceneState(ctx);
  state.questionIndex = 0;
  state.answers = {};
  await ctx.answerCbQuery("Заполняем заново");
  await upsertBotMessage(ctx, `${pe("edit")} ${form.questions[0].prompt}`, {
    reply_markup: applicationCancelKeyboard().reply_markup,
  });
});

scene.action("app:submit", async (ctx) => {
  const { state } = await ensureSceneState(ctx);
  const user = await ensureUser(ctx.from);
  try {
    await createAndSendApplication(ctx, user, state.formId, state.answers);
  } catch (error) {
    logger.error("Application submit failed", error);
    await ctx.answerCbQuery("Ошибка отправки", { show_alert: true });
    return;
  }
  await ctx.answerCbQuery("Заявка отправлена");
  await upsertBotMessage(
    ctx,
    `${pe("success")} Заявка отправлена! Ожидай решения администратора.`,
    { reply_markup: applicationResultKeyboard().reply_markup }
  );
  await ctx.scene.leave();
});

module.exports = { applicationScene: scene };
