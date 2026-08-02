const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: "" },
    firstName: { type: String, default: "" },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isTeamMember: { type: Boolean, default: false },
    isCurator: { type: Boolean, default: false, index: true },
    curatorDescription: { type: String, default: "" },
    curatorPercent: { type: Number, default: 80, min: 1, max: 100 },
    curatorMinProfits: { type: Number, default: 0, min: 0 },
    /** Telegram ID куратора, к которому привязан воркер */
    curatorTelegramId: { type: String, default: "", index: true },
    isCaller: { type: Boolean, default: false, index: true },
    callerDescription: { type: String, default: "" },
    callerPercent: { type: Number, default: 80, min: 1, max: 100 },
    callerMinProfits: { type: Number, default: 0, min: 0 },
    /** Telegram ID прозвонщицы, к которой привязан воркер */
    callerTelegramId: { type: String, default: "", index: true },
    isBanned: { type: Boolean, default: false },
    isModerator: { type: Boolean, default: false, index: true },
    warns: [
      {
        reason: { type: String, default: "" },
        adminId: { type: String, default: "" },
        adminName: { type: String, default: "" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    profitPercent: { type: Number, default: 80, min: 1, max: 100 },
    totalProfit: { type: Number, default: 0, min: 0 },
    bio: { type: String, default: "" },
    isAnonymous: { type: Boolean, default: false },
    panelUsername: { type: String, default: "" },
    panelPassword: { type: String, default: "" },
    panelCreatedAt: { type: Date, default: null },
    payoutMethod: { type: String, default: "" },
    payoutAddress: { type: String, default: "" },
    teamReferrals: [
      {
        domainId: { type: Number, required: true },
        path: { type: String, required: true },
        panelLinkId: { type: Number, default: null },
      },
    ],
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

module.exports = mongoose.model("User", userSchema);
