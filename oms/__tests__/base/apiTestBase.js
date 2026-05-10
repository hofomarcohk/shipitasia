const request = require('supertest');
const config = require('dotenv').config();
const { MongoClient } = require('mongodb');

const apiUrl = config.parsed.APP_URL;
const mongoUrl = config.parsed.MONGODB_URI;
const mongoDbName = config.parsed.MONGODB_NAME;

let accounts = {
  admin: {
    apiKey: 'ae8adf0d-19c2-4347-b264-e385e2ec7657',
    apiSecret: '61b11ca8-9161-4c44-980e-339d019c37ca',
  },
};
let client;
let db;
let token = "";
let clientId = "";

// setup
const before = async (role = null) => {
  client = await MongoClient.connect(mongoUrl);
  db = client.db(mongoDbName);

  if (token.length == 0 && role && accounts[role]) {
    const timestamp = `${new Date().getTime()}`;
    const getSignature = await get('/api/v1.0/auth/signature',{}, {
      'x-api-key': accounts[role].apiKey,
      'x-secret': accounts[role].apiSecret,
      "x-timestamp": timestamp
    });

    const signature = getSignature.body.data.signature;
    const getToken = await get('/api/v1.0/auth/getToken', {}, {
      'x-api-key': accounts[role].apiKey,
      'x-signature': signature,
      "x-timestamp": timestamp
    });
    token = getToken.body.data.token;
  }

  if (clientId.length == 0) {
    const clients = await findDb('clients', {
      username: role
    });
    clientId = clients[0]._id.toString();
  }
};

const getClientId = () => {
  return clientId;
}

const after = async () => {
  await client.close();
  token = "";
};

// http request
const post = async (endpoint, data = {}, headers = {}) => {
  let r = request(apiUrl)
    .post(endpoint)
    .send(data)
    .set('Accept', 'application/json');
  if (token && token.length > 0) {
    r = r.set('Authorization', `Bearer ${token}`);
  }
  Object.keys(headers).forEach(key => {
    r = r.set(key, headers[key]);
  });
  return await r;
};

const get = async (endpoint, data={}, headers={}) => {
  let r = request(apiUrl)
    .get(endpoint)
    .set('Accept', 'application/json');
  if (token.length > 0) {
    r = r.set('Authorization', `Bearer ${token}`);
  }
  Object.keys(headers).forEach(key => {
    r = r.set(key, headers[key]);
  });

  return await r;
};

const put = async (endpoint, data={}, headers={}) => {
  let r = request(apiUrl)
    .put(endpoint)
    .send(data)
    .set('Accept', 'application/json');
  if (token.length > 0) {
    r = r.set('Authorization', `Bearer ${token}`);
  }
  Object.keys(headers).forEach(key => {
    r = r.set(key, headers[key]);
  });
  return await r;
};

const del = async (endpoint, data={}, headers={}) => {
  let r = request(apiUrl)
    .delete(endpoint)
    .send(data)
    .set('Accept', 'application/json');
  if (token.length > 0) {
    r = r.set('Authorization', `Bearer ${token}`);
  }
  Object.keys(headers).forEach(key => {
    r = r.set(key, headers[key]);
  });
  return await r;
};

// mongodb
const insertDb = async (collection, data) => {
  return await db.collection(collection).insertOne(data);
}

const findDb = async (collection, query) => {
  return await db.collection(collection).find(query).toArray();
}

const aggregateDb = async (collection, pipeline) => {
  return await db.collection(collection).aggregate(pipeline).toArray();
}

const deleteDb = async (collection, query) => {
  return await db.collection(collection).deleteMany(query);
}



// utils
const randomString = (length) => {
  let result = '';
  let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

const login = async (account) => {
  let response = await post('/api/v1.0/login', account);
  token = response.body.data?.token;
  return response;
}

module.exports = {
  getClientId,
  before, after, 
  post, get, put, del, 
  findDb, aggregateDb, deleteDb, insertDb,
  randomString, login
};


