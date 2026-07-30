const { isAdminTelegramId } = require("../services/userService");
const {
  getPostByCode,
  listSavedPosts,
  buildInlineResult,
} = require("../services/postService");
const { logger } = require("../utils/logger");

function registerInlineHandlers(bot) {
  bot.on("inline_query", async (ctx) => {
    try {
      if (!isAdminTelegramId(ctx.from.id)) {
        await ctx.answerInlineQuery([], {
          cache_time: 1,
          is_personal: true,
        });
        return;
      }

      const q = String(ctx.inlineQuery.query || "").trim();
      let results = [];

      if (q) {
        const post = await getPostByCode(q);
        if (post) {
          const item = buildInlineResult(post);
          if (item) results = [item];
        } else {
          const posts = await listSavedPosts(20, 0);
          const filtered = posts.filter(
            (p) =>
              p.code.includes(q) ||
              String(p.name || "").toLowerCase().includes(q.toLowerCase())
          );
          results = filtered
            .map((p) => buildInlineResult(p))
            .filter(Boolean)
            .slice(0, 20);
        }
      } else {
        const posts = await listSavedPosts(20, 0);
        results = posts.map((p) => buildInlineResult(p)).filter(Boolean);
      }

      await ctx.answerInlineQuery(results, {
        cache_time: 5,
        is_personal: true,
      });
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
