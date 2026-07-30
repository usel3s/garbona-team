const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: "" },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isTeamMember: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    profitPercent: { type: Number, default: 80, min: 1, max: 100 },
    totalProfit: { type: Number, default: 0, min: 0 },
    bio: { type: String, default: "" },
    isAnonymous: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

module.exports = mongoose.model("User", userSchema);
