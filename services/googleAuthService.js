import { OAuth2Client } from 'google-auth-library';
import { GOOGLE_CLIENT_ID } from '../config/envConfig.js';

let cachedClient = null;

const getClient = () => {
    if (!GOOGLE_CLIENT_ID) {
        const err = new Error('Google auth is not configured on this server.');
        err.code = 'provider_not_configured';
        throw err;
    }
    if (!cachedClient) {
        cachedClient = new OAuth2Client(GOOGLE_CLIENT_ID);
    }
    return cachedClient;
};

/**
 * Verify a Google ID token and return normalized identity data.
 * Throws on invalid tokens, unverified emails, or missing config.
 *
 * @param {string} idToken Google ID token from the client
 * @returns {Promise<{ googleId: string, email: string, name: string, givenName: string, familyName: string, picture: string, emailVerified: boolean }>}
 */
export const verifyGoogleToken = async (idToken) => {
    if (!idToken || typeof idToken !== 'string') {
        const err = new Error('Google ID token is required.');
        err.code = 'invalid_token';
        throw err;
    }

    const client = getClient();

    let ticket;
    try {
        ticket = await client.verifyIdToken({
            idToken,
            audience: GOOGLE_CLIENT_ID,
        });
    } catch (e) {
        const err = new Error('Invalid or expired Google token.');
        err.code = 'invalid_token';
        throw err;
    }

    const payload = ticket.getPayload();
    if (!payload) {
        const err = new Error('Invalid Google token payload.');
        err.code = 'invalid_token';
        throw err;
    }

    if (!payload.email_verified) {
        const err = new Error('Google account email is not verified.');
        err.code = 'email_not_verified';
        throw err;
    }

    return {
        googleId: payload.sub,
        email: (payload.email || '').toLowerCase(),
        name: payload.name || '',
        givenName: payload.given_name || '',
        familyName: payload.family_name || '',
        picture: payload.picture || '',
        emailVerified: true,
    };
};

export default { verifyGoogleToken };
