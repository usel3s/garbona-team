const { Scenes } = require("telegraf");
const { pe } = require("../utils/emoji");
const {
  extractContentFromMessage,
  parseButtonsInput,
  savePostFromDraft,
  listSavedPosts,
  countSavedPosts,
  getPostById,
  deletePostById,
  escapeHtml,
  sanitizeEntities,
} = require("../services/postService");
const {
  postbotHomeKeyboard,
  postbotAwaitContentKeyboard,
  postbotButtonsHelpKeyboard,
  postbotNameKeyboard,
  postbotReadyKeyboard,
  postbotSavedListKeyboard,
  postbotViewKeyboard,
} = require("../keyboards/postbot");
const { sendUiMessage, renderPostSettings, deleteUiMessage } = require("../utils/postbotUi");
const { logger } = require("../utils/logger");

const PAGE_SIZE = 8;

function getDraft(ctx) {
  if (!ctx.scene.session.draft) {
    ctx.scene.session.draft = {
      contentType: "text",
      text: "",
      entities: [],
      fileId: "",
      buttons: [],
      linkPreview: true,
    };
  }
  return ctx.scene.session.draft;
}

function setStep(ctx, step) {
  ctx.scene.session.step = step;
}

function getStep(ctx) {
  return ctx.scene.session.step || "home";
}

async function showHome(ctx) {
  setStep(ctx, "home");
  ctx.scene.session.draft = null;
  await sendUiMessage(
    ctx,
    [
      `${pe("bot")} <b>Postbot</b>`,
      "",
      "Создавай посты с текстом, медиа и кнопками,",
      "сохраняй и делись через inline в любом чате.",
    ].join("\n"),
    { reply_markup: postbotHomeKeyboard().reply_markup }
  );
}

async function showAwaitContent(ctx) {
  setStep(ctx, "await_content");
  ctx.scene.session.draft = {
    contentType: "text",
    text: "",
    entities: [],
    fileId: "",
    buttons: [],
    linkPreview: true,
  };
  await sendUiMessage(
    ctx,
    [
      `${pe("edit")} <b>Что будем постить?</b>`,
      "",
      "Пришли текст, фото, видео, GIF, аудио или документ.",
      "",
      `${pe("info")} Подсказка: можно использовать эмодзи, жирный шрифт или скрытый текст — форматирование сохранится.`,
      "",
      `${pe("loading")} Жду твоё сообщение…`,
    ].join("\n"),
    { reply_markup: postbotAwaitContentKeyboard().reply_markup }
  );
}

async function showButtonsHelp(ctx) {
  setStep(ctx, "await_buttons");
  await sendUiMessage(
    ctx,
    [
      `${pe("link")} <b>Добавление кнопок</b>`,
      "",
      "• Новая строка = новая кнопка",
      "• Несколько в ряд — раздели через <code>|</code>",
      "• Цвет в конце: зелёный, синий или красный",
      "",
      "<b>Шаблон:</b>",
      "<pre>Реклама — @channel — зелёный",
      "Канал — t.me/example | Поддержка — https://t.me/support</pre>",
      "",
      `${pe("edit")} Отправь кнопки:`,
    ].join("\n"),
    { reply_markup: postbotButtonsHelpKeyboard().reply_markup }
  );
}

async function showNamePrompt(ctx) {
  setStep(ctx, "await_name");
  await sendUiMessage(
    ctx,
    `${pe("tag")} Отправь название для поста. Максимум 50 символов.`,
    { reply_markup: postbotNameKeyboard().reply_markup }
  );
}

async function finalizePost(ctx, name) {
  const draft = getDraft(ctx);
  try {
    const post = await savePostFromDraft(draft, {
      name,
      createdByTelegramId: ctx.from.id,
    });
    const username = ctx.botInfo?.username || "Bot";
    const shareCode = `@${username} ${post.code}`;
    setStep(ctx, "home");
    ctx.scene.session.draft = null;
    await sendUiMessage(
      ctx,
      [
        `${pe("celebrate")} <b>Пост готов!</b>`,
        "",
        `<code>${shareCode}</code>`,
        "",
        `${pe("info")} Скопируй код и используй в любом чате для мгновенной отправки поста.`,
        "",
        `<b>Название:</b> ${post.name}`,
      ].join("\n"),
      { reply_markup: postbotReadyKeyboard(post.code).reply_markup }
    );
  } catch (error) {
    logger.error("Postbot save failed", error);
    await sendUiMessage(
      ctx,
      `${pe("error")} Не удалось сохранить пост. Попробуй ещё раз.`,
      { reply_markup: postbotHomeKeyboard().reply_markup }
    );
  }
}

async function showSavedList(ctx, page = 0) {
  setStep(ctx, "saved");
  const safePage = Math.max(0, Number(page) || 0);
  const total = await countSavedPosts();
  const posts = await listSavedPosts(PAGE_SIZE, safePage * PAGE_SIZE);
  const hasPrev = safePage > 0;
  const hasNext = (safePage + 1) * PAGE_SIZE < total;

  if (!posts.length) {
    await sendUiMessage(
      ctx,
      `${pe("file")} Сохранённых постов пока нет.`,
      { reply_markup: postbotHomeKeyboard().reply_markup }
    );
    return;
  }

  await sendUiMessage(
    ctx,
    [
      `${pe("file")} <b>Сохранённые посты</b>`,
      "",
      `Страница <b>${safePage + 1}</b> · всего: <b>${total}</b>`,
      "",
      "Выбери пост:",
    ].join("\n"),
    {
      reply_markup: postbotSavedListKeyboard(posts, safePage, hasPrev, hasNext)
        .reply_markup,
    }
  );
}

async function showPostView(ctx, postId) {
  const post = await getPostById(postId);
  if (!post) {
    await ctx.answerCbQuery?.("Пост не найден", { show_alert: true });
    await showSavedList(ctx, 0);
    return;
  }

  setStep(ctx, "view");
  const username = ctx.botInfo?.username || "Bot";
  await sendUiMessage(
    ctx,
    [
      `${pe("file")} <b>${escapeHtml(post.name)}</b>`,
      "",
      `<b>Код:</b> <code>@${username} ${post.code}</code>`,
      `<b>Тип:</b> ${post.contentType}`,
      `<b>Кнопок:</b> ${(post.buttons || []).reduce((n, r) => n + r.length, 0)}`,
      `<b>Создан:</b> ${new Date(post.createdAt).toLocaleString("ru-RU")}`,
      "",
      post.text ? escapeHtml(post.text.slice(0, 500)) : "<i>без текста</i>",
    ].join("\n"),
    { reply_markup: postbotViewKeyboard(String(post._id), post.code).reply_markup }
  );
}

const scene = new Scenes.BaseScene("postbotScene");

scene.enter(async (ctx) => {
  await showHome(ctx);
});

scene.action("postbot:home", async (ctx) => {
  await ctx.answerCbQuery();
  await showHome(ctx);
});

scene.action("postbot:create", async (ctx) => {
  await ctx.answerCbQuery();
  await showAwaitContent(ctx);
});

scene.action("postbot:settings", async (ctx) => {
  await ctx.answerCbQuery();
  setStep(ctx, "settings");
  await renderPostSettings(ctx, getDraft(ctx));
});

scene.action("postbot:edit_text", async (ctx) => {
  await ctx.answerCbQuery();
  setStep(ctx, "await_text_edit");
  await sendUiMessage(
    ctx,
    `${pe("edit")} Пришли новый текст (или подпись к медиа).`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Назад", callback_data: "postbot:settings", icon_custom_emoji_id: "5870982283724328568" }],
        ],
      },
    }
  );
});

scene.action("postbot:add_buttons", async (ctx) => {
  await ctx.answerCbQuery();
  await showButtonsHelp(ctx);
});

scene.action("postbot:clear_buttons", async (ctx) => {
  const draft = getDraft(ctx);
  draft.buttons = [];
  await ctx.answerCbQuery("Кнопки очищены");
  setStep(ctx, "settings");
  await renderPostSettings(ctx, draft);
});

scene.action("postbot:toggle_preview", async (ctx) => {
  const draft = getDraft(ctx);
  draft.linkPreview = !draft.linkPreview;
  await ctx.answerCbQuery(
    draft.linkPreview ? "Превью включено" : "Превью выключено"
  );
  await renderPostSettings(ctx, draft);
});

scene.action("postbot:done", async (ctx) => {
  await ctx.answerCbQuery();
  await showNamePrompt(ctx);
});

scene.action("postbot:skip_name", async (ctx) => {
  await ctx.answerCbQuery();
  await finalizePost(ctx, "");
});

scene.action(/^postbot:saved(?::(\d+))?$/, async (ctx) => {
  await ctx.answerCbQuery();
  const page = ctx.match[1] != null ? Number(ctx.match[1]) : 0;
  await showSavedList(ctx, page);
});

scene.action(/^postbot:view:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await showPostView(ctx, ctx.match[1]);
});

scene.action(/^postbot:delete:(.+)$/, async (ctx) => {
  await deletePostById(ctx.match[1]);
  await ctx.answerCbQuery("Удалено");
  await showSavedList(ctx, 0);
});

async function tryDeleteUserMessage(ctx) {
  try {
    await ctx.deleteMessage(ctx.message.message_id);
  } catch (_) {
    /* ignore */
  }
}

scene.on("message", async (ctx) => {
  const step = getStep(ctx);

  if (step === "await_content") {
    const content = extractContentFromMessage(ctx.message);
    await tryDeleteUserMessage(ctx);
    if (!content) {
      await sendUiMessage(
        ctx,
        `${pe("error")} Пришли текст, фото, видео, GIF, аудио или документ.`,
        { reply_markup: postbotAwaitContentKeyboard().reply_markup }
      );
      return;
    }
    const draft = getDraft(ctx);
    Object.assign(draft, content, {
      buttons: draft.buttons || [],
      linkPreview: draft.linkPreview !== false,
    });
    setStep(ctx, "settings");
    await renderPostSettings(ctx, draft);
    return;
  }

  if (step === "await_text_edit") {
    const msg = ctx.message;
    await tryDeleteUserMessage(ctx);
    const draft = getDraft(ctx);
    if (msg.text != null) {
      draft.text = msg.text;
      draft.entities = sanitizeEntities(msg.entities || []);
      if (draft.contentType !== "text" && !draft.fileId) {
        draft.contentType = "text";
      }
    } else if (msg.caption != null) {
      draft.text = msg.caption;
      draft.entities = sanitizeEntities(msg.caption_entities || []);
    } else {
      await sendUiMessage(ctx, `${pe("error")} Пришли текстовое сообщение.`);
      return;
    }
    setStep(ctx, "settings");
    await renderPostSettings(ctx, draft);
    return;
  }

  if (step === "await_buttons") {
    const text = ctx.message.text;
    await tryDeleteUserMessage(ctx);
    if (!text) {
      await sendUiMessage(
        ctx,
        `${pe("error")} Отправь кнопки текстом по шаблону.`,
        { reply_markup: postbotButtonsHelpKeyboard().reply_markup }
      );
      return;
    }
    const parsed = parseButtonsInput(text);
    if (parsed.error) {
      await sendUiMessage(ctx, `${pe("error")} ${parsed.error}`, {
        reply_markup: postbotButtonsHelpKeyboard().reply_markup,
      });
      return;
    }
    const draft = getDraft(ctx);
    draft.buttons = parsed.rows;
    setStep(ctx, "settings");
    await renderPostSettings(ctx, draft);
    return;
  }

  if (step === "await_name") {
    const name = (ctx.message.text || "").trim();
    await tryDeleteUserMessage(ctx);
    if (!name) {
      await sendUiMessage(
        ctx,
        `${pe("error")} Название не может быть пустым, либо нажми «Пропустить».`,
        { reply_markup: postbotNameKeyboard().reply_markup }
      );
      return;
    }
    await finalizePost(ctx, name.slice(0, 50));
  }
});

module.exports = { postbotScene: scene };
