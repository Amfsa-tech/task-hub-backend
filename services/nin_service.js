import createError from 'http-errors';
import fetch from 'node-fetch';
import { QOREID_CLIENT_ID, QOREID_SECRET_KEY } from '../config/envConfig.js';

// QoreID API Configuration
const QOREID_BASE_URL = 'https://api.qoreid.com';
// Ensure env values are strings and trimmed
const CLIENT_ID = (QOREID_CLIENT_ID ?? '').toString().trim();
const SECRET_KEY = (QOREID_SECRET_KEY ?? '').toString().trim();

/**
 * Service for verifying Nigerian National Identification Number (NIN) using QoreID API
 * Provides methods to obtain access token, verify NIN, and validate user details
 */

class NINVerificationService {
    constructor() {
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    /**
     * Get access token from QoreID API
     * Reuses existing token if still valid
     */
     async getAccessToken() {
            if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
                return this.accessToken;
            }

            if (!CLIENT_ID || !SECRET_KEY) {
                throw createError(
                    500,
                    'QoreID credentials are missing'
                );
            }

            const response = await fetch(`${QOREID_BASE_URL}/token`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    clientId: CLIENT_ID,
                    secret: SECRET_KEY,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw createError(
                    response.status,
                    `Token generation failed: ${error}`
                );
            }

            const data = await response.json();

            this.accessToken = data.accessToken;
            this.tokenExpiry = new Date(
                Date.now() + ((data.expiresIn - 30) * 1000)
            );

            return this.accessToken;
        }



    /**
     * Verify NIN with QoreID API
     */
    async verifyNIN(nin, applicantData) {
        try {
            const token = await this.getAccessToken();

            const response = await fetch(`${QOREID_BASE_URL}/v1/ng/identities/nin/${nin}`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(applicantData),
            });

            if (!response.ok) {
                let errorData = {
                    statusCode: response.status,
                    message: response.statusText,
                };

                try {
                    errorData = await response.json();
                } catch {
                    // Use default error data if JSON parsing fails
                }

                // Handle specific error cases
                switch (response.status) {
                    case 401:
                        // Token might be expired, clear it and retry once
                        this.accessToken = null;
                        this.tokenExpiry = null;
                        throw createError(401, 'Authentication failed. Please try again.');
                    case 404:
                        throw createError(404, errorData.message || 'NIN not found. Please provide a valid NIN.');
                    case 500:
                        throw createError(500, 'NIN verification service is temporarily unavailable. Please try again later.');
                    default:
                        throw createError(response.status, errorData.message || 'NIN verification failed');
                }
            }

            return await response.json();
        } catch (error) {
            if (error instanceof Error && 'status' in error) {
                throw error; // Re-throw HTTP errors
            }
            throw createError(500, `NIN verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Validate user details against NIN record with flexible matching
     */
    validateUserDetails(verificationResult, userDetails) {
        const { summary, nin } = verificationResult;
        const mismatches = [];

        // Check if verification was successful
        if (summary.nin_check.status === 'NO_MATCH') {
            return {
                isValid: false,
                matchStatus: 'NO_MATCH',
                mismatches: ['Critical details do not match NIN record'],
            };
        }

        // Validate critical fields manually for additional security
        if (nin) {
            const ninFirstName = nin.firstname.toLowerCase().trim();
            const ninLastName = nin.lastname.toLowerCase().trim();
            const userFirstName = userDetails.firstName.toLowerCase().trim();
            const userLastName = userDetails.lastName.toLowerCase().trim();

            if (ninFirstName !== userFirstName) {
                mismatches.push('First name does not match NIN record');
            }

            if (ninLastName !== userLastName) {
                mismatches.push('Last name does not match NIN record');
            }

            // Validate gender (convert to consistent format)
            const ninGender = nin.gender.toLowerCase();
            const userGender = userDetails.gender.toLowerCase();
            const genderMatch = 
                (ninGender === 'm' && (userGender === 'm' || userGender === 'male')) ||
                (ninGender === 'f' && (userGender === 'f' || userGender === 'female'));

            if (!genderMatch) {
                mismatches.push('Gender does not match NIN record');
            }

            // Validate date of birth (NIN format: DD-MM-YYYY, user format: YYYY-MM-DD)
            if (nin.birthdate) {
                const ninDate = this.convertNinDateToISO(nin.birthdate);
                if (ninDate !== userDetails.dob) {
                    mismatches.push('Date of birth does not match NIN record');
                }
            }
        }

        // Determine if validation passed
        const isValid = mismatches.length === 0 && 
                                     (summary.nin_check.status === 'EXACT_MATCH' || summary.nin_check.status === 'PARTIAL_MATCH');

        return {
            isValid,
            matchStatus: summary.nin_check.status,
            mismatches,
        };
    }

    /**
     * Convert NIN date format (DD-MM-YYYY) to ISO format (YYYY-MM-DD)
     */
    convertNinDateToISO(ninDate) {
        try {
            const [day, month, year] = ninDate.split('-');
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        } catch {
            return ninDate; // Return original if conversion fails
        }
    }

    /**
     * Main method to verify user identity
     */
    async verifyUserIdentity(nin, userDetails) {
        // Validate NIN format
        if (!nin || nin.length !== 11 || !/^\d{11}$/.test(nin)) {
            throw createError(400, 'Invalid NIN format. NIN must be 11 digits.');
        }

        // Prepare verification request
        const verificationRequest = {
            firstname: userDetails.firstName.trim(),
            lastname: userDetails.lastName.trim(),
            dob: userDetails.dob,
            gender: userDetails.gender.toLowerCase() === 'male' ? 'm' : 'f',
        };

        // Include optional fields if provided
        if (userDetails.phoneNumber) {
            verificationRequest.phone = userDetails.phoneNumber;
        }
        if (userDetails.email) {
            verificationRequest.email = userDetails.email;
        }

        // Perform NIN verification
        const verificationResult = await this.verifyNIN(nin, verificationRequest);

        // Validate the results
        const validationResult = this.validateUserDetails(verificationResult, userDetails);

        return {
            isVerified: validationResult.isValid,
            verificationResult,
            validationResult,
        };
    }
}

// Export singleton instance
export const ninVerificationService = new NINVerificationService();
export default ninVerificationService;



