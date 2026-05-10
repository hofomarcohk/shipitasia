const { put, before, after, deleteDb, insertDb, getClientId, findDb } = require('../../base/apiTestBase');
const { inboundSample } = require('../../base/factory/inboundFactory');
const { ObjectId } = require('mongodb');

const collection = "inbound_requests";
describe('Inbonud', () => {
  beforeAll(async () => {
    await before('admin');
    await deleteDb(collection);
  });

  afterAll(async () => {
    after();
  });

  it('SHOULD update inbound', async () => {
    const inbound = inboundSample({
      clientId: getClientId(),
    });
    const inboundId = (await insertDb(collection, inbound)).insertedId.toString();

    const param = {
      data: {
        id: inboundId,
        warehouse: "hk02",
        title: "Shipment from China",
        category: [],
        declaredValue: 100,
        width: 10,
        length: 10,
        height: 10,
        weight: 10,
        trackingNo: "123456789",
        restrictionTags: [],
        remarks: "",
        source: {
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
        }
      }
    };
    const response = await put('/api/v1.0/inbound', param);
    expect(response.status).toBe(200);
    // check the database
    delete param.data.id
    const data = await findDb(collection, { _id: new ObjectId(inboundId) });
    const matchData = Object.keys(param.data).reduce((acc, key) => {
      acc[key] = data[0][key];
      return acc;
    }, {});
    expect(matchData).toEqual(param.data);
  });
});




