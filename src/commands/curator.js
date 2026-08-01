const { upsertBotMessage } = require("../utils/message");
const { curatorsIntroHtml, curatorsIntroKeyboard } = require("../utils/curatorsUi");

async function renderCurators(ctx) {
  return upsertBotMessage(ctx, curatorsIntroHtml(), {
    reply_markup: curatorsIntroKeyboard().reply_markup,
  });
}

function registerCuratorCommand(bot) {
  bot.command("curator", async (ctx) => {
    await renderCurators(ctx);
  });
  bot.command("curators", async (ctx) => {
    await renderCurators(ctx);
  });
}

module.exports = { registerCuratorCommand, renderCurators };
