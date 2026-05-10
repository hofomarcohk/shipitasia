const request = require('supertest');
const config = require('dotenv').config();
const { MongoClient } = require('mongodb');

const apiUrl = config.parsed.APP_URL;
const mongoUrl = config.parsed.MONGODB_URI;
const mongoDbName = config.parsed.MONGODB_NAME;

let accounts = {
  admin: {
    username: 'admin',
    password: 'admin123456',
  },
  client: {
    username: 'client',
    password: 'client123456',
  },
};
let client;
let db;
let token = "";

// setup
const before = async (role = null) => {
  client = await MongoClient.connect(mongoUrl);
  db = client.db(mongoDbName);

  if (token.length == 0 && role && accounts[role]) {
    let response = await post('/api/wms/login', accounts[role]);
    token = response.body.data?.token || "";
  }
};

const after = async () => {
  await client.close();
  token = "";
};

// http request
const post = async (endpoint, data) => {
  let r = request(apiUrl)
    .post(endpoint)
    .send(data)
    .set('Accept', 'application/json');
  if (token && token.length > 0) {
    r = r.set('Authorization', `Bearer ${token}`);
  }
  return await r;
};

const get = async (endpoint, data) => {
  let r = request(apiUrl)
    .get(endpoint)
    .set('Accept', 'application/json');
  if (token.length > 0) {
    r = r.set('Authorization', `Bearer ${token}`);
  }
  return await r;
};

const put = async (endpoint, data) => {
  let r = request(apiUrl)
    .put(endpoint)
    .send(data)
    .set('Accept', 'application/json');
  if (token.length > 0) {
    r = r.set('Authorization', `Bearer ${token}`);
  }
  return await r;
};

const del = async (endpoint, data) => {
  let r = request(apiUrl)
    .delete(endpoint)
    .send(data)
    .set('Accept', 'application/json');
  if (token.length > 0) {
    r = r.set('Authorization', `Bearer ${token}`);
  }
  return await r;
};

// mongodb
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
  let response = await post('/api/wms/login', account);
  token = response.body.data?.token;
  return response;
}

module.exports = {
  before, after, 
  post, get, put, del, 
  findDb, aggregateDb, deleteDb,
  randomString, login
};


