// Phase 9 — extend carriers seed with tracking_url_template.
//
// Adds the public tracking URL template field to existing carrier docs.
// Fuuffy points to the UPS public tracking page (Fuuffy is a UPS reseller,
// see P9 §7.1). Yunexpress is left null per spec (v1 doesn't wire its
// tracking page — admin can fill it in later).

module.exports = {
  async up(db) {
    await db
      .collection("carriers")
      .updateOne(
        { carrier_code: "fuuffy" },
        {
          $set: {
            tracking_url_template:
              "https://www.ups.com/track?loc=zh_HK&tracknum={tracking_no}",
            updatedAt: new Date(),
          },
        }
      );
    await db
      .collection("carriers")
      .updateOne(
        { carrier_code: "yunexpress" },
        {
          $set: {
            tracking_url_template: null,
            updatedAt: new Date(),
          },
        }
      );
  },

  async down(db) {
    await db
      .collection("carriers")
      .updateMany(
        { carrier_code: { $in: ["fuuffy", "yunexpress"] } },
        { $unset: { tracking_url_template: "" } }
      );
  },
};
