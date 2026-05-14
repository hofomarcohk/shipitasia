// Assign human-friendly SIA0000-SIA9999 codes to clients. The admin
// (test@xxx.com) is pinned to SIA0000; every other client gets a code in
// createdAt order starting at SIA0001. Internal _id (ObjectId) is
// unchanged — code is display-only.

const ADMIN_EMAIL = "test@xxx.com";

function fmt(n) {
  return "SIA" + String(n).padStart(4, "0");
}

module.exports = {
  async up(db) {
    // 1. Pin admin to SIA0000.
    const admin = await db
      .collection("clients")
      .findOne({ email: ADMIN_EMAIL });
    if (admin && admin.code !== "SIA0000") {
      await db
        .collection("clients")
        .updateOne({ _id: admin._id }, { $set: { code: "SIA0000" } });
    }

    // 2. Assign SIA0001+ in createdAt order to clients that don't yet have
    //    a code. Skip the admin row.
    const filter = {
      email: { $ne: ADMIN_EMAIL },
      $or: [{ code: { $exists: false } }, { code: null }, { code: "" }],
    };
    const others = await db
      .collection("clients")
      .find(filter)
      .sort({ createdAt: 1 })
      .toArray();

    // Find highest existing non-admin code so re-runs continue the sequence
    // instead of recycling numbers.
    const highest = await db
      .collection("clients")
      .find({ code: { $regex: "^SIA[0-9]{4}$" }, email: { $ne: ADMIN_EMAIL } })
      .sort({ code: -1 })
      .limit(1)
      .toArray();
    let n = 0;
    if (highest.length > 0) {
      n = parseInt(highest[0].code.slice(3), 10);
    }

    for (const c of others) {
      n += 1;
      await db
        .collection("clients")
        .updateOne({ _id: c._id }, { $set: { code: fmt(n) } });
    }

    // Index for fast lookups by code.
    await db
      .collection("clients")
      .createIndex({ code: 1 }, { sparse: true, unique: true, name: "code_unique" });
  },
  async down(db) {
    await db
      .collection("clients")
      .updateMany({}, { $unset: { code: "" } });
    await db
      .collection("clients")
      .dropIndex("code_unique")
      .catch(() => {});
  },
};
