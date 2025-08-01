import dotenv from 'dotenv';
dotenv.config();

const { 
  PORT, 
  NODE_ENV, 
  MONGO_URI,
  QOREID_CLIENT_ID,
  QOREID_SECRET_KEY,
  JWT_SECRET,
  ONESIGNAL_APP_ID,
  ONESIGNAL_REST_KEY
} = process.env;

export { 
  PORT, 
  NODE_ENV, 
  MONGO_URI,
  QOREID_CLIENT_ID,
  QOREID_SECRET_KEY,
  JWT_SECRET,
  ONESIGNAL_APP_ID,
  ONESIGNAL_REST_KEY
};
