import crypto from 'crypto';
import axios from 'axios';

// Vuvaa Demo Credentials
const VUVAA_BASE_URL = 'https://premiere.vuvaa.com/demo/NIN_Validation_LIVE';
const ENCRYPTION_KEY = 'FD!-F=15B46BAD21';
const IV = '0123456789012345';

// Fix for Node.js 32-byte requirement
const getKeyBuffer = () => {
    const keyBuffer = Buffer.alloc(32);
    keyBuffer.write(ENCRYPTION_KEY, 'utf-8');
    return keyBuffer;
};

const getIvBuffer = () => {
    const ivBuffer = Buffer.alloc(16);
    ivBuffer.write(IV, 'utf-8');
    return ivBuffer;
};

const encryptPayload = (data) => {
    const jsonString = JSON.stringify(data);
    const cipher = crypto.createCipheriv('aes-256-cbc', getKeyBuffer(), getIvBuffer());
    let encrypted = cipher.update(jsonString, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
};

const decryptPayload = (encryptedBase64) => {
    const decipher = crypto.createDecipheriv('aes-256-cbc', getKeyBuffer(), getIvBuffer());
    let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
};

const createDemoUser = async () => {
    // The exact payload required by Vuvaa docs
    // Generate a random 6-character string to guarantee uniqueness
    const uniqueStr = crypto.randomBytes(3).toString('hex');

    // The exact payload required by Vuvaa docs, but with unique identifiers
    const userData = {
        email: `taskhub_${uniqueStr}@mail.com`, 
        password: "TaskhubPassword123", 
        firstname: "Taskhub",
        lastname: "Admin",
        username: `taskhub_admin_${uniqueStr}`, 
        dob: "1995-01-01",
        gender: "Male",
        address: "123 Tech Street",
        state: "Lagos",
        phone: "08012345678",
        account_level: "2",
        enterprise_id: `ENT-${uniqueStr}`, // <-- Unique Enterprise ID!
        ip_addresses: ["127.0.0.1", "::1"],
        ip_val_flag: 0 
    };

    console.log("Encrypting payload...");
    const encryptedPayload = encryptPayload(userData);

    try {
        console.log("Sending request to Vuvaa...");
        const response = await axios.post(`${VUVAA_BASE_URL}/create_user`, {
            payload: encryptedPayload
        });

        console.log("Decrypting response...");
        const decryptedResponse = decryptPayload(response.data.payload);

        console.log("\n✅ SUCCESS! Here is the response from Vuvaa:");
        console.log(decryptedResponse);
        
        console.log("\n⚠️ IMPORTANT: Put these in your .env file now:");
        console.log(`VUVAA_USERNAME=${userData.username}`);
        console.log(`VUVAA_PASSWORD=${userData.password}`);

    } catch (error) {
        console.error("❌ ERROR CREATING USER:");
        if (error.response) {
            try {
                 console.log(decryptPayload(error.response.data.payload));
            } catch (e) {
                 console.log(error.response.data);
            }
        } else {
            console.log(error.message);
        }
    }
};

createDemoUser();