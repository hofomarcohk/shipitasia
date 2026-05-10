const { before, after, deleteDb, insertDb, getClientId, get } = require('../../base/apiTestBase');
const { inboundSample } = require('../../base/factory/inboundFactory');

const collection = "outbound_requests";
describe('Get Outbound', () => {
  beforeAll(async () => {
    await before('admin');
    await deleteDb(collection);

  });

  afterAll(async () => {
    after();
  });

  it('SHOULD return outbound request', async () => {
    const inbound = inboundSample({
      clientId: getClientId(),
    });
    await insertDb(collection, inbound);

    const response = await get('/api/v1.0/outbound');
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(1);
  });


});




