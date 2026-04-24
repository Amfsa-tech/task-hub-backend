import * as StellarSdk from 'stellar-sdk';
import User from '../models/user.js'; 

// Load credentials from your .env
const MASTER_PUBLIC_KEY = process.env.STELLAR_MASTER_PUBLIC_KEY;
const IS_TESTNET = process.env.STELLAR_NETWORK === 'TESTNET';

// Connect to the correct Stellar Network
const server = new StellarSdk.Horizon.Server(
    IS_TESTNET ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org'
);

// Mock Exchange Rate (e.g., 1 XLM = 1500 NGN)
// In production, you would fetch this from an API like CoinGecko
const XLM_TO_NGN_RATE = 1500; 

export const startDepositListener = () => {
    if (!MASTER_PUBLIC_KEY) {
        console.warn('⚠️ STELLAR_MASTER_PUBLIC_KEY is not set. Stellar deposit listener disabled.');
        return;
    }

    console.log(`📡 Starting Stellar Deposit Listener on ${IS_TESTNET ? 'TESTNET' : 'PUBLIC'}...`);

    // Stream payments sent to the Master Wallet
    server.payments()
        .forAccount(MASTER_PUBLIC_KEY)
        .cursor('now') // Only listen for NEW payments from this exact moment forward
        .stream({
            onmessage: async (payment) => {
                try {
                    // --- ADD THIS DEBUG LINE RIGHT HERE ---
                    // ... (previous code up to extracting the memo)

                    console.log(`Checking Database for Account with Memo ID: ${memo}`);

                    // 1. Clean the memo (removes invisible spaces and forces uppercase to guarantee a match)
                    const cleanMemo = String(memo).trim().toUpperCase();

                    // 2. Check the User database first
                    let targetAccount = await User.findOne({ stellarMemoId: cleanMemo });

                    // 3. If not found in Users, check the Tasker database!
                    if (!targetAccount) {
                        targetAccount = await Tasker.findOne({ stellarMemoId: cleanMemo });
                    }

                    // 4. If STILL not found, then it's truly an orphan deposit
                    if (!targetAccount) {
                        console.log(`No User or Tasker found for Memo ID: ${cleanMemo}. Deposit ignored.`);
                        return;
                    }

                    // 5. Calculate the Naira value
                    const xlmAmount = parseFloat(payment.amount);
                    const nairaValue = xlmAmount * XLM_TO_NGN_RATE;

                    // 6. Credit the account's wallet
                    targetAccount.wallet += nairaValue;
                    await targetAccount.save();

                    console.log(`Success! Credited ₦${nairaValue} to account ID: ${targetAccount._id}`);

                } catch (error) {
                    console.error('Error processing Stellar deposit:', error);
                }
            },
            onerror: (error) => {
                console.error('Stellar stream error:', error);
            }
        });
};