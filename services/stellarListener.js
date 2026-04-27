import * as StellarSdk from 'stellar-sdk';
import * as Sentry from '@sentry/node';
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
                    console.log(`[DEBUG] Saw a payment sent to: ${payment.to}`);

                    // 1. Verify it's incoming (not an outgoing payout we sent)
                    if (payment.to !== MASTER_PUBLIC_KEY) return;

                    // 2. Verify it is native XLM (not a custom token)
                    if (payment.asset_type !== 'native') return;

                    console.log(`\n💰 Incoming XLM Detected! Amount: ${payment.amount}`);

                    // 3. Fetch the full transaction to read the Memo ID
                    const transaction = await payment.transaction();
                    const memo = transaction.memo;

                    if (!memo) {
                        console.log('❌ Deposit received but NO MEMO was attached. Cannot credit user.');
                        return;
                    }

                    console.log(`🔍 Checking Database for Account with Memo ID: ${memo}`);

                    // 4. Clean the memo (removes invisible spaces and forces uppercase)
                    const cleanMemo = String(memo).trim().toUpperCase();

                    // 5. Check the User database first
                    let targetAccount = await User.findOne({ stellarMemoId: cleanMemo });

                    // 6. If not found in Users, check the Tasker database
                    if (!targetAccount) {
                        targetAccount = await Tasker.findOne({ stellarMemoId: cleanMemo });
                    }

                    // 7. CRITICAL: If STILL not found, stop here so the app doesn't crash!
                    if (!targetAccount) {
                        console.log(`⚠️ No User or Tasker found for Memo ID: ${cleanMemo}. Deposit ignored.`);
                        return;
                    }

                    // 8. Calculate the Naira value
                    const xlmAmount = parseFloat(payment.amount);
                    const nairaValue = xlmAmount * XLM_TO_NGN_RATE;

                    // 9. Credit the account's wallet
                    targetAccount.wallet += nairaValue;
                    await targetAccount.save();

                    console.log(`✅ Success! Credited ₦${nairaValue} to account ID: ${targetAccount._id}`);

                } catch (error) {
                    console.error('🚨 Error processing Stellar deposit:', error);
                    Sentry.captureException(error);
                }
            },
            onerror: (error) => {
                console.error('🔌 Stellar stream error:', error);
            }
        });
};