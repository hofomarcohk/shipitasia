const { faker } = require('@faker-js/faker');

const outboundFactory = {
    data: {
        warehouse: "hk01",
        toWarehouse: "hk02",
        clientId: "",
        status: "pending",
        logisticPlatform:"",
        trackingNo: "",
        width: 10,
        length: 10,
        height: 10,
        weight: 10,
        remarks: "",
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
        inboundIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    },

    create(overrides={}){
        this.data = {...this.data, ...overrides};
        return this;
    },

    async save(){
        const collection = "outbound_requests";
        const insert = await insertDb(collection, this.data);
        this.data.id = insert.insertedId.toString();
        return this;
    }
}


module.exports = {
    outboundFactory
};