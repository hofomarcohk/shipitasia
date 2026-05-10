const { before, after, post, put, findDb, deleteDb, login, randomString } = require('../testBase');

const api = '/api/cms/account';
const username = 'test_' + randomString(5);
const sampleClient = {
  username: username,
  password: 'test12345',
  firstName: 'first_name',
  lastName: 'last_name',
  company: 'company',
  email: username + '@test.com',
  langCode: 'en',
  contacts: [
    {
      name: 'name',
      phone: '1234567890'
    }
  ],
  address: [
    {
      country: 'country',
      city: 'city',
      region: 'region',
      district: 'district',
      state: 'state',
      address: 'address',
      zip: '123456',
    }
  ],
  externalToken: [],
  apiTokens: [],
};

describe('Create Account', () => {
  beforeAll(async () => {
    await before('admin');
  });

  afterAll(async () => {
    await deleteDb('clients', { username: sampleClient.username });
    after();
  });

  it('WHEN missing username', async () => {
    let client = { ...sampleClient };
    delete client.username;
    const response = await post(api, client);
    expect(response.body.message).toBe('Missing Field: User Name');
  });

  it('WHEN missing password', async () => {
    let client = { ...sampleClient };
    delete client.password;
    const response = await post(api, client);
    expect(response.body.message).toBe('Missing Field: Password');
  });

  it('WHEN missing firstName', async () => {
    let client = { ...sampleClient };
    delete client.firstName;
    const response = await post(api, client);
    expect(response.body.message).toBe('Missing Field: First Name');
  });

  it('WHEN missing lastName', async () => {
    let client = { ...sampleClient };
    delete client.lastName;
    const response = await post(api, client);
    expect(response.body.message).toBe('Missing Field: Last Name');
  });

  it('WHEN missing company', async () => {
    let client = { ...sampleClient };
    delete client.company;
    const response = await post(api, client);
    expect(response.body.message).toBe('Missing Field: Company');
  });

  it('WHEN missing email', async () => {
    let client = { ...sampleClient };
    delete client.email;
    const response = await post(api, client);
    expect(response.body.message).toBe('Missing Field: Email');
  });

  it('WHEN invalid email', async () => {
    let client = { ...sampleClient };
    client.email = 'invalid_email';
    const response = await post(api, client);
    expect(response.body.message).toBe('Invalid Field: Email');
  });

  it('SHOULD create client', async () => {
    let client = { ...sampleClient };
    const response = await post(api, client);
    expect(response.body.message).toBe('Success');
    const a = await findDb('clients', { username: client.username });
    expect(a.length).toBe(1);
  });

});

describe('Edit Account', () => {
  beforeAll(async () => {
    await before('admin');
    let client = { ...sampleClient };
    await post(api, client);
  });

  afterAll(async () => {
    await deleteDb('clients', { username: sampleClient.username });
    after();
  });

  it('WHEN invalid email', async () => {
    await login({
      username: sampleClient.username,
      password: sampleClient.password
    });
    const response = await put(api, {
      username: sampleClient.username,
      email: 'new_password',
    });
    expect(response.body.message).toBe('Invalid Field: Email');
  });

  it('SHOULD update client data', async () => {
    let client = { ...sampleClient };
    await login({
      username: sampleClient.username,
      password: sampleClient.password
    });
    delete client.role;
    delete client.password;
    const response = await put(api, {
      username: sampleClient.username,
      firstName: 'new_first_name',
      lastName: 'new_last_name',
      company: 'new_company',
      email: 'new_' + sampleClient.email,
      langCode: 'zh',
      contacts: [
        {
          name: 'new_name',
          phone: '0987654321'
        }
      ],
      address: [
        {
          country: 'new_country',
          city: 'new_city',
          region: 'new_region',
          district: 'new_district',
          state: 'new_state',
          address: 'new_address',
          zip: '654321',
        }
      ],
    });
    expect(response.body.message).toBe('Success');

    // check db
    const a = await findDb('clients', { username: sampleClient.username });
    expect(a.length).toBe(1);
    expect(a[0].firstName).toBe('new_first_name');
    expect(a[0].lastName).toBe('new_last_name');
    expect(a[0].company).toBe('new_company');
    expect(a[0].email).toBe('new_' + sampleClient.email);
    expect(a[0].langCode).toBe('zh');
    expect(a[0].contacts[0].name).toBe('new_name');
    expect(a[0].contacts[0].phone).toBe('0987654321');
    expect(a[0].address[0].country).toBe('new_country');
    expect(a[0].address[0].city).toBe('new_city');
    expect(a[0].address[0].region).toBe('new_region');
    expect(a[0].address[0].district).toBe('new_district');
    expect(a[0].address[0].state).toBe('new_state');
    expect(a[0].address[0].address).toBe('new_address');
    expect(a[0].address[0].zip).toBe('654321');
  });

  it('SHOULD update password', async () => {
    await login({
      username: sampleClient.username,
      password: sampleClient.password
    });
    await put(api, {
      username: sampleClient.username,
      password: 'new_password',
    });

    // try login with new password
    const loginResponse = await login({
      username: sampleClient.username,
      password: 'new_password'
    });
    expect(loginResponse.body.message).toBe('Success');
  });
});



