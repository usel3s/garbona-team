const mongoose = require("mongoose");

const steamLogSchema = new mongoose.Schema({
  sourceId: { type: String, required: true, unique: true, index: true },
  steamId: { type: String, default: "" },
  status: {
    type: String,
    enum: ["new", "validation_pending", "processed", "failed"],
    default: "new",
    index: true,
  },
  logKind: {
    type: String,
    enum: ["valid", "mafile", "invalid", "other", ""],
    default: "",
    index: true,
  },
  totalProfit: { type: Number, default: 0 },
  balanceUsd: { type: Number, default: 0 },
  inventoryUsd: { type: Number, default: 0 },
  accountUsername: { type: String, default: "" },
  channelMessageId: { type: String, default: "" },
  dmMessageId: { type: String, default: "" },
  dmChatId: { type: String, default: "" },
  errorMessage: { type: String, default: "" },
  ownerTelegramId: { type: String, default: "", index: true },
  saleStatus: {
    type: String,
    enum: ["none", "pending", "done", "cancelled"],
    default: "none",
    index: true,
  },
  saleChannelChatId: { type: String, default: "" },
  saleChannelMessageId: { type: String, default: "" },
  processStatus: {
    type: String,
    enum: ["none", "pending", "done", "cancelled"],
    default: "none",
    index: true,
  },
}, { timestamps: true });

steamLogSchema.index({ ownerTelegramId: 1, logKind: 1, createdAt: -1 });
steamLogSchema.index({ ownerTelegramId: 1, createdAt: -1 });

module.exports = mongoose.model("SteamLog", steamLogSchema);
