const { post, before, after, deleteDb, findDb } = require('../../base/apiTestBase');

describe('Inbonud', () => {
  beforeAll(async () => {
    await before('admin');
    await deleteDb('inbound_requests');
  });

  afterAll(async () => {
    after();
  });

  it('SHOULD create inbound', async () => {
    const param = {
      data: [
        {
          warehouse: "hk01",
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
          willArriveAt: new Date(),
          source: {
            contactPerson:"William Chan",
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
            contactPerson:"William Chan",
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
      ]
    };
    const response = await post('/api/v1.0/inbound', param);
    expect(response.status).toBe(200);

    // check the database
    const inbound = await findDb('inbound_requests', param.data[0]);
    expect(inbound).not.toBeNull();
  });

  
});




