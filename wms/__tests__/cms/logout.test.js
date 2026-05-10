const { get, before, after } = require('../base/cmsTestBase');

const api = '/api/wms/logout';

describe('Logout', () => {
  beforeAll(async () => {
    await before('admin');
  });
  afterAll(async () => {
    after();
  });
  it('SHOULD return success', async () => {
    const response = await get(api);
    expect(response.body.message).toBe('Success');
  });
});



