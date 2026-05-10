const { faker } = require('@faker-js/faker');
const { insertDb } = require('../apiTestBase');

const inboundSample = (overrides = {}) => {
    return {
        warehouse: "hk01",
        clientId: "",
        status: "pending",
        title: "",
        category: [],
        declaredValue: 100,
        width: 10,
        length: 10,
        height: 10,
        weight: 10,
        trackingNo: faker.string.alphanumeric(10),
        restrictionTags: [],
        referenceNo: "",
        remarks: "",
        willArriveAt: new Date(),
        source: {
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
        destination: {
            contactPerson: "William Chan",
            mobile: "+852965432178",
            country: "China",
            city: "Hong Kong",
            region: "Kowloon",
            district: "Kowloon City",
            state: "",
            address: "Flat 1, 1/F, Block A, 1 King Wah Road",
            zip: "000000",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}

const inboundFactory = {
    data: {
        warehouse: "hk01",
        clientId: "",
        status: "pending",
        category: [],
        declaredValue: 100,
        width: 10,
        length: 10,
        height: 10,
        weight: 10,
        trackingNo: faker.string.alphanumeric(10),
        restrictionTags: [],
        referenceNo: "",
        remarks: "",
        willArriveAt: new Date(),
        from: {
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
        to: {
            contactPerson: "William Chan",
            mobile: "+852965432178",
            country: "China",
            city: "Hong Kong",
            region: "Kowloon",
            district: "Kowloon City",
            state: "",
            address: "Flat 1, 1/F, Block A, 1 King Wah Road",
            zip: "000000",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
    },

    create(overrides = {}) {
        this.data = { ...this.data, ...overrides };
        return this;
    },

    async save() {
        const collection = "inbound_requests";
        const insert = await insertDb(collection, this.data);
        this.data.id = insert.insertedId.toString();
        return this;
    }
}

module.exports = {
    inboundSample, inboundFactory
};