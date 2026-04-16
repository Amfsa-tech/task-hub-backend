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
    console.log(`📡 Starting Stellar Deposit Listener on ${IS_TESTNET ? 'TESTNET' : 'PUBLIC'}...`);

    // Stream payments sent to the Master Wallet
    server.payments()
        .forAccount(MASTER_PUBLIC_KEY)
        .cursor('now') // Only listen for NEW payments from this exact moment forward
        .stream({
            onmessage: async (payment) => {
                try {
                    // --- ADD THIS DEBUG LINE RIGHT HERE ---
                    console.log(`[DEBUG] Saw a payment sent to: ${payment.to}`);

                    // 1. Verify it's incoming (not an outgoing payout we sent)
                    if (payment.to !== MASTER_PUBLIC_KEY) return;

                    // 2. Verify it is native XLM (not a custom token)
                    if (payment.asset_type !== 'native') return;

                    console.log(`\n Incoming XLM Detected! Amount: ${payment.amount}`);

                    // 3. Fetch the full transaction to read the Memo ID
                    const transaction = await payment.transaction();
                    const memo = transaction.memo;

                    if (!memo) {
                        console.log('Deposit received but NO MEMO was attached. Cannot credit user.');
                        // TODO: Log this to an "Unclaimed Funds" database table for manual admin review
                        return;
                    }

                    console.log(`Checking Database for User with Memo ID: ${memo}`);

                    // 4. Find the user attached to this Memo ID
                    const targetUser = await User.findOne({ stellarMemoId: memo });

                    if (!targetUser) {
                        console.log(`No user found for Memo ID: ${memo}. Deposit ignored.`);
                        return;
                    }

                    // 5. Calculate the Naira value
                    const xlmAmount = parseFloat(payment.amount);
                    const nairaValue = xlmAmount * XLM_TO_NGN_RATE;

                    // 6. Credit the user's wallet
                    // --- FIX 1: Changed from walletBalance to just wallet ---
                    targetUser.wallet += nairaValue;
                    await targetUser.save();

                    // --- FIX 2: Made the log safer so it prints the ID instead of undefined ---
                    console.log(`Success! Credited ₦${nairaValue} to user ID: ${targetUser._id}`);
                    // TODO: Create a "Transaction History" record in your DB here
                    // TODO: Trigger a Push Notification / WebSocket event to update the user's app UI

                } catch (error) {
                    console.error('Error processing Stellar deposit:', error);
                }
            },
            onerror: (error) => {
                console.error('Stellar stream error:', error);
            }
        });
};