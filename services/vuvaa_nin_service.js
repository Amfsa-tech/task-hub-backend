import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const VUVAA_BASE_URL = process.env.VUVAA_BASE_URL;
const ENCRYPTION_KEY = process.env.VUVAA_ENCRYPTION_KEY; 
const IV = process.env.VUVAA_IV;

// --- Helper Functions for Vuvaa AES Encryption ---

// --- Helper Functions for Vuvaa AES Encryption ---

// Node.js strict AES-256 requires exactly a 32-byte key.
// Since Vuvaa provided a 16-character key, we must pad it with null bytes to reach 32.
const getKeyBuffer = () => {
    const keyBuffer = Buffer.alloc(32); // Creates a 32-character space filled with zeroes
    keyBuffer.write(ENCRYPTION_KEY, 'utf-8'); // Writes the 16-char key into the first half
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
    try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', getKeyBuffer(), getIvBuffer());
        let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (error) {
        console.error("Vuvaa Decryption Error:", error);
        throw new Error("Failed to decrypt response from Vuvaa");
    }
};
// --- Vuvaa API Calls ---

/**
 * Logs into Vuvaa to get the required Bearer Token.
 * Tokens expire in 3 hours, but for simplicity, we fetch a new one per request.
 * (In production, you should cache this token in memory or Redis until it expires).
 */
const getVuvaaAccessToken = async () => {
    const loginData = {
        username: process.env.VUVAA_USERNAME,
        password: process.env.VUVAA_PASSWORD
    };

    const payload = encryptPayload(loginData);

    try {
        const response = await axios.post(`${VUVAA_BASE_URL}/login`, { payload });
        const decryptedResponse = decryptPayload(response.data.payload);

        if (decryptedResponse.status === 200 && decryptedResponse.data && decryptedResponse.data.access_token) {
            return decryptedResponse.data.access_token;
        } else {
            throw new Error(`Vuvaa Login Failed: ${decryptedResponse.message}`);
        }
    } catch (error) {
        console.error("Vuvaa Auth Error:", error.response?.data || error.message);
        throw new Error("Could not authenticate with Vuvaa API");
    }
};

/**
 * Validates the NIN using the Vuvaa API
 */
export const verifyNINWithVuvaa = async (nin, referenceId) => {
    try {
        // 1. Get the Auth Token
        const token = await getVuvaaAccessToken();

        // 2. Prepare the payload (Using 'nyscCheck' as the default reason per their docs)
        const requestData = {
            username: process.env.VUVAA_USERNAME,
            nin: nin.toString(),
            reason: "nyscCheck", 
            reference_id: referenceId
        };

        const encryptedPayload = encryptPayload(requestData);

        // 3. Make the API Call
        const response = await axios.post(
            `${VUVAA_BASE_URL}/verify_nin`,
            { payload: encryptedPayload },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // 4. Decrypt and handle the response
        const decryptedResponse = decryptPayload(response.data.payload);

        if (decryptedResponse.status === 200) {
             return {
                isVerified: true,
                data: decryptedResponse.data
            };
        } else {
             return {
                isVerified: false,
                message: decryptedResponse.message || "Verification failed at Vuvaa",
                data: null
             };
        }

    } catch (error) {
        // Specifically catch the 402 Insufficient Funds error
        if (error.response && error.response.status === 402) {
            console.error("Vuvaa API Error: Insufficient Wallet Balance (402)");
            return {
                isVerified: false,
                message: "Insufficient funds in verification provider wallet. Please contact admin.",
                data: null
            };
        }

        // Catch other Axios errors (like 400 Bad Request from Vuvaa)
        if (error.response && error.response.data) {
            try {
                // Try to decrypt their error message if it's encrypted
                const decryptedError = decryptPayload(error.response.data.payload);
                console.error("Vuvaa NIN Verification Error:", decryptedError);
                return {
                    isVerified: false,
                    message: decryptedError.message || "Verification failed at provider",
                    data: null
                };
            } catch (e) {
                console.error("Vuvaa NIN Verification Error (Raw):", error.response.data);
            }
        } else {
            console.error("Vuvaa NIN Verification Error:", error.message);
        }

        return {
            isVerified: false,
            message: "Internal server error during NIN verification",
            data: null
        };
    }
};