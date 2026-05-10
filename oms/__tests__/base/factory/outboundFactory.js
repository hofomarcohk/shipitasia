const { faker } = require('@faker-js/faker');

const outboundFactory = {
    data: {
        warehouseCode: "HK01",
        clientId: "",
        status: "pending",
        logisticParty: "yunexpress",
        trackingNo: "",
        width: 10,
        length: 10,
        height: 10,
        weight: 10,
        remarks: "",
        to: {
            contactPerson: faker.person.fullName(),
            mobile: faker.phone.number(),
            country: "China",
            city: "Hong Kong",
            region: "Kowloon",
            district: "Kowloon City",
            state: "",
            address: "Flat 1, 1/F, Block A, 1 King Wah Road",
            zip: "000000",
        },
        inboundRequestIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    },

    create(overrides = {}) {
        this.data = { ...this.data, ...overrides };
        return this;
    },

    async save() {
        const collection = "outbound_requests";
        const insert = await insertDb(collection, this.data);
        this.data.id = insert.insertedId.toString();
        return this;
    }
}


module.exports = {
    outboundFactory
};