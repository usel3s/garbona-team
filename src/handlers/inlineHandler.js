const { isAdminTelegramId, getUserByTelegramId } = require("../services/userService");
const {
  getPostByCode,
  listSavedPosts,
  buildInlineResult,
} = require("../services/postService");
const {
  listUserProfits,
  groupUserProfits,
} = require("../services/profitService");
const { listUserRequests } = require("../services/withdrawalService");
const { getCurrencyContext, formatDisplayAmount } = require("../services/currencyService");
const { logger } = require("../utils/logger");

const MONTHS_RU = [
  "",
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

function formatDateTime(date) {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} в ${hh}:${mi}`;
}

function formatDateLong(date) {
  return new Date(date).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseInlineQuery(raw) {
  const q = String(raw || "").trim();
  if (!q) return { type: "empty" };

  if (q === "profits" || q.startsWith("profits?")) {
    const params = new URLSearchParams(q.includes("?") ? q.split("?")[1] : "");
    const groupBy = params.get("group_by");
    if (groupBy === "month" || groupBy === "day") {
      return { type: "profits_group", mode: groupBy };
    }
    return { type: "profits_list" };
  }

  if (q === "wallet" || q === "transactions" || q.startsWith("wallet?")) {
    return { type: "wallet" };
  }

  return { type: "postbot", query: q };
}

function articleResult({ id, title, description, messageText }) {
  return {
    type: "article",
    id: String(id).slice(0, 64),
    title,
    description,
    input_message_content: {
      message_text: messageText,
      parse_mode: "HTML",
    },
  };
}

async function buildProfitsListResults(user, currencyCtx) {
  const rows = await listUserProfits(user, 40);
  if (!rows.length) {
    return [
      articleResult({
        id: "profits-empty",
        title: "Профитов пока нет",
        description: "Когда начислят — появятся здесь",
        messageText: "Профитов пока нет.",
      }),
    ];
  }

  return rows.map((row, idx) => {
    const amount = formatDisplayAmount(row.workerShare, currencyCtx);
    const when = formatDateTime(row.createdAt);
    return articleResult({
      id: `profit-${row._id || idx}`,
      title: "Профит",
      description: `${amount} · ${when}`,
      messageText: [
        "<b>Профит</b>",
        `Сумма: ${amount}`,
        `Дата: ${when}`,
      ].join("\n"),
    });
  });
}

async function buildProfitsGroupResults(user, mode, currencyCtx) {
  const rows = await groupUserProfits(user, mode);
  if (!rows.length) {
    return [
      articleResult({
        id: "profits-group-empty",
        title: "Нет данных",
        description: "Профитов за период нет",
        messageText: "Профитов пока нет.",
      }),
    ];
  }

  return rows.map((row, idx) => {
    const amount = formatDisplayAmount(row.total, currencyCtx);
    let title;
    if (mode === "day") {
      title = `${String(row.day).padStart(2, "0")}.${String(row.month).padStart(2, "0")}.${row.year}`;
    } else {
      title = `${MONTHS_RU[row.month] || row.month} ${row.year}`;
    }
    const description = `${row.count} профита — ${amount}`;
    return articleResult({
      id: `pg-${mode}-${row.year}-${row.month}-${row.day || 0}-${idx}`,
      title,
      description,
      messageText: `<b>${title}</b>\n${description}`,
    });
  });
}

async function buildWalletResults(user, currencyCtx) {
  const [profits, withdrawals] = await Promise.all([
    listUserProfits(user, 40),
    listUserRequests(user.telegramId, 40),
  ]);

  const items = [];
  for (const p of profits) {
    items.push({
      kind: "in",
      at: new Date(p.createdAt).getTime(),
      amountUsd: p.workerShare,
      id: `in-${p._id}`,
    });
  }
  for (const w of withdrawals) {
    items.push({
      kind: "out",
      at: new Date(w.createdAt).getTime(),
      amountUsd: w.amountUsd,
      id: `out-${w._id}`,
    });
  }

  items.sort((a, b) => b.at - a.at);

  if (!items.length) {
    return [
      articleResult({
        id: "wallet-empty",
        title: "История пуста",
        description: "Пока нет операций",
        messageText: "История транзакций пуста.",
      }),
    ];
  }

  return items.slice(0, 40).map((item) => {
    const amount = formatDisplayAmount(item.amountUsd, currencyCtx);
    const when = formatDateLong(item.at);
    if (item.kind === "in") {
      return articleResult({
        id: item.id,
        title: "Пополнение",
        description: `Сумма: ${amount}`,
        messageText: [
          "<b>Пополнение</b>",
          `Сумма: ${amount}`,
          `Дата: ${when}`,
        ].join("\n"),
      });
    }
    return articleResult({
      id: item.id,
      title: "Вывод",
      description: `Сумма: ${amount}`,
      messageText: [
        "<b>Вывод</b>",
        `Сумма: ${amount}`,
        `Дата: ${when}`,
      ].join("\n"),
    });
  });
}

async function handlePostbotInline(ctx, query) {
  if (!isAdminTelegramId(ctx.from.id)) {
    await ctx.answerInlineQuery([], { cache_time: 1, is_personal: true });
    return;
  }

  let results = [];
  if (query) {
    const post = await getPostByCode(query);
    if (post) {
      const item = buildInlineResult(post);
      if (item) results = [item];
    } else {
      const posts = await listSavedPosts(20, 0);
      const filtered = posts.filter(
        (p) =>
          p.code.includes(query) ||
          String(p.name || "").toLowerCase().includes(query.toLowerCase())
      );
      results = filtered.map((p) => buildInlineResult(p)).filter(Boolean).slice(0, 20);
    }
  } else {
    const posts = await listSavedPosts(20, 0);
    results = posts.map((p) => buildInlineResult(p)).filter(Boolean);
  }

  await ctx.answerInlineQuery(results, { cache_time: 5, is_personal: true });
}

function registerInlineHandlers(bot) {
  bot.on("inline_query", async (ctx) => {
    try {
      const parsed = parseInlineQuery(ctx.inlineQuery.query);

      if (parsed.type === "profits_list" || parsed.type === "profits_group" || parsed.type === "wallet") {
        const user = await getUserByTelegramId(ctx.from.id);
        const allowed =
          user &&
          (user.isTeamMember || user.role === "admin" || isAdminTelegramId(ctx.from.id));
        if (!allowed) {
          await ctx.answerInlineQuery([], { cache_time: 1, is_personal: true });
          return;
        }

        const currencyCtx = await getCurrencyContext();
        let results = [];

        if (parsed.type === "profits_list") {
          results = await buildProfitsListResults(user, currencyCtx);
        } else if (parsed.type === "profits_group") {
          results = await buildProfitsGroupResults(user, parsed.mode, currencyCtx);
        } else {
          results = await buildWalletResults(user, currencyCtx);
        }

        await ctx.answerInlineQuery(results, { cache_time: 2, is_personal: true });
        return;
      }

      if (parsed.type === "empty") {
        if (isAdminTelegramId(ctx.from.id)) {
          await handlePostbotInline(ctx, "");
          return;
        }
        await ctx.answerInlineQuery([], { cache_time: 1, is_personal: true });
        return;
      }

      await handlePostbotInline(ctx, parsed.query || "");
    } catch (error) {
      logger.error("Inline query failed", error);
      try {
        await ctx.answerInlineQuery([], { cache_time: 1, is_personal: true });
      } catch (_) {
        /* ignore */
      }
    }
  });
}

module.exports = { registerInlineHandlers };
