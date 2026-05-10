const { del, before, after, deleteDb, insertDb, getClientId, findDb } = require('../../base/apiTestBase');
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

  it('SHOULD cancel inbound', async () => {
    const inbound = inboundSample({
      clientId: getClientId(),
    });
    const inboundId = "" + (await insertDb(collection, inbound)).insertedId.toString();

    const param = {
      id: inboundId,
    };
    const response = await del('/api/v1.0/inbound', param);
    expect(response.status).toBe(200);
    
    // check the database
    const data = await findDb(collection, { _id: new ObjectId(inboundId), status: "cancelled" });
    expect(data.length).toBe(1);
  });
});




