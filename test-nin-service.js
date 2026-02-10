// Test script to verify NIN service configuration
import dotenv from 'dotenv';
import ninVerificationService from './services/nin_service.js';

dotenv.config();

async function testNINService() {
    console.log('Testing NIN Verification Service...\n');
    
    // Test 1: Check if environment variables are loaded
    console.log('1. Environment Variables Check:');
    console.log(`QOREID_CLIENT_ID: ${process.env.QOREID_CLIENT_ID ? '✓ Set' : '✗ Missing'}`);
    console.log(`QOREID_SECRET_KEY: ${process.env.QOREID_SECRET_KEY ? '✓ Set' : '✗ Missing'}`);
    
    // Test 2: Try to get access token
    console.log('\n2. Access Token Test:');
    try {
        const token = await ninVerificationService.getAccessToken();
        console.log('✓ Access token obtained successfully');
        console.log(`Token length: ${token.length} characters`);
    } catch (error) {
        console.log('✗ Failed to get access token:', error.message);
    }
    
    // Test 3: Validate NIN format function
    console.log('\n3. NIN Validation Test:');
    const testNINs = [
        '12345678901', // Valid format
        '123456789',   // Too short
        '1234567890a', // Contains letter
        '123456789012' // Too long
    ];
    
    testNINs.forEach(nin => {
        const isValid = /^\d{11}$/.test(nin);
        console.log(`NIN: ${nin} - ${isValid ? '✓ Valid' : '✗ Invalid'}`);
    });
    
    console.log('\nNIN Service configuration test completed.');
}

// Run the test
testNINService().catch(console.error);
