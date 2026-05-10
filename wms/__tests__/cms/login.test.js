const { post } = require('../base/cmsTestBase');

const api = '/api/wms/login';

describe('Login', () => {
  it('SHOULD return token', async () => {
    const param = {
      username: "admin",
      password: "admin123456"
    };
    const response = await post(api, param);
    expect(response.body.data).toHaveProperty('token');
  });

});



