import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

const uri = process.env.MONGO_URI;
console.log('Connecting to:', uri ? uri.substring(0, 30) + '...' : 'undefined');

try {
  await mongoose.connect(uri);
  const collection = mongoose.connection.db.collection('taskers');
  
  // Check if the password_1 index exists
  const indexes = await collection.indexes();
  const passwordIndex = indexes.find(i => i.name === 'password_1');
  
  if (passwordIndex) {
    console.log('Found stale password_1 index:', JSON.stringify(passwordIndex, null, 2));
    console.log('Dropping password_1 index...');
    await collection.dropIndex('password_1');
    console.log('Successfully dropped password_1 index!');
  } else {
    console.log('No password_1 index found - already clean.');
  }
  
  // Verify remaining indexes
  const remaining = await collection.indexes();
  console.log('\nRemaining indexes:', JSON.stringify(remaining.map(i => i.name), null, 2));
  
  process.exit(0);
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}
