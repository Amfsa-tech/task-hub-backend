/**
 * Utility functions for NIN (National Identity Number) operations
 */

/**
 * Validate NIN format
 * @param {string} nin - The NIN to validate
 * @returns {boolean} indicating if NIN is valid
 */
export function isValidNIN(nin) {
    // NIN should be exactly 11 digits
    return /^\d{11}$/.test(nin);
}

/**
 * Format NIN for display (mask middle digits for privacy)
 * @param {string} nin - The NIN to format
 * @returns {string} formatted NIN string (e.g., "123****5678")
 */
export function formatNINForDisplay(nin) {
    if (!isValidNIN(nin)) {
        return nin;
    }
    
    return `${nin.substring(0, 3)}****${nin.substring(7)}`;
}

/**
 * Clean NIN input (remove spaces, dashes, etc.)
 * @param {string} nin - The NIN input to clean
 * @returns {string} cleaned NIN string
 */
export function cleanNIN(nin) {
    return nin.replace(/\s|-/g, '');
}

/**
 * Validate and clean NIN input
 * @param {string} nin - The NIN input to validate and clean
 * @returns {{isValid: boolean, cleanedNIN: string, error?: string}} object with isValid flag and cleaned NIN
 */
export function validateAndCleanNIN(nin) {
    if (!nin) {
        return { isValid: false, cleanedNIN: '', error: 'NIN is required' };
    }

    const cleanedNIN = cleanNIN(nin);

    if (!isValidNIN(cleanedNIN)) {
        return { 
            isValid: false, 
            cleanedNIN, 
            error: 'NIN must be exactly 11 digits' 
        };
    }

    return { isValid: true, cleanedNIN };
}

/**
 * Convert date from NIN format (DD-MM-YYYY) to ISO format (YYYY-MM-DD)
 * @param {string} ninDate - Date in DD-MM-YYYY format
 * @returns {string} date in YYYY-MM-DD format
 */
export function convertNinDateToISO(ninDate) {
    try {
        const [day, month, year] = ninDate.split('-');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } catch {
        return ninDate; // Return original if conversion fails
    }
}

/**
 * Convert date from ISO format (YYYY-MM-DD) to NIN format (DD-MM-YYYY)
 * @param {string} isoDate - Date in YYYY-MM-DD format
 * @returns {string} date in DD-MM-YYYY format
 */
export function convertISOToNinDate(isoDate) {
    try {
        const [year, month, day] = isoDate.split('-');
        return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
    } catch {
        return isoDate; // Return original if conversion fails
    }
}

/**
 * Normalize gender input for API compatibility
 * @param {string} gender - Gender input (male/female/m/f)
 * @returns {'m' | 'f'} normalized gender ('m' or 'f')
 */
export function normalizeGender(gender) {
    const normalizedGender = gender.toLowerCase().trim();
    
    if (normalizedGender === 'male' || normalizedGender === 'm') {
        return 'm';
    }
    
    if (normalizedGender === 'female' || normalizedGender === 'f') {
        return 'f';
    }
    
    throw new Error('Invalid gender. Must be "male", "female", "m", or "f"');
}

/**
 * Generate a masked phone number for display
 * @param {string} phoneNumber - The phone number to mask
 * @returns {string} masked phone number string
 */
export function maskPhoneNumber(phoneNumber) {
    if (phoneNumber.length < 4) {
        return phoneNumber;
    }
    
    const visibleStart = phoneNumber.substring(0, 3);
    const visibleEnd = phoneNumber.substring(phoneNumber.length - 2);
    const maskedMiddle = '*'.repeat(phoneNumber.length - 5);
    
    return `${visibleStart}${maskedMiddle}${visibleEnd}`;
}

/**
 * Generate a masked email for display
 * @param {string} email - The email to mask
 * @returns {string} masked email string
 */
export function maskEmail(email) {
    const [localPart, domain] = email.split('@');
    
    if (!localPart || !domain) {
        return email;
    }
    
    const maskedLocal = localPart.length > 2 
        ? `${localPart[0]}***${localPart[localPart.length - 1]}`
        : localPart;
        
    return `${maskedLocal}@${domain}`;
}
