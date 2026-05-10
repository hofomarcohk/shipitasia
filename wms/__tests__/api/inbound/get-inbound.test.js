const { before, after, deleteDb, getClientId, get } = require('../../base/apiTestBase');
const { inboundFactory } = require('../../base/factory/inboundFactory');

const collection = "inbound_requests";
describe('Inbonud', () => {
  beforeAll(async () => {
    await before('admin');
    await deleteDb(collection);

  });

  afterAll(async () => {
    after();
  });

  it('SHOULD return inbound request', async () => {
    await (inboundFactory.create({
      clientId: getClientId(),
    }).save());

    const response = await get('/api/v1.0/inbound');
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
  });
});




