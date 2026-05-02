import * as StellarSdk from 'stellar-sdk';
import * as Sentry from '@sentry/node';
import User from '../models/user.js';
import Tasker from '../models/tasker.js';
import { notifyWalletFunded, notifyTaskerWalletFunded } from '../utils/notificationUtils.js'; 

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

                    if (payment.to !== MASTER_PUBLIC_KEY) return;
                    if (payment.asset_type !== 'native') return;

                    console.log(`\n💰 Incoming XLM Detected! Amount: ${payment.amount}`);

                    const transaction = await payment.transaction();
                    const memo = transaction.memo;

                    if (!memo) {
                        console.log('❌ Deposit received but NO MEMO was attached. Cannot credit user.');
                        return;
                    }

                    console.log(`🔍 Checking Database for Account with Memo ID: ${memo}`);
                    const cleanMemo = String(memo).trim().toUpperCase();

                    let targetAccount = await User.findOne({ stellarMemoId: cleanMemo });
                    if (!targetAccount) {
                        targetAccount = await Tasker.findOne({ stellarMemoId: cleanMemo });
                    }

                    if (!targetAccount) {
                        console.log(`⚠️ No User or Tasker found for Memo ID: ${cleanMemo}. Deposit ignored.`);
                        return;
                    }

                    const xlmAmount = parseFloat(payment.amount);
                    const nairaValue = xlmAmount * XLM_TO_NGN_RATE;

                    // ---------------------------------------------------------
                    // 🔐 SECURE SNAPSHOT LOGIC ADDED HERE
                    // ---------------------------------------------------------
                    const previousBalance = targetAccount.wallet || 0;
                    const newBalance = previousBalance + nairaValue;
                    
                    targetAccount.wallet = newBalance;
                    await targetAccount.save();
                    // ---------------------------------------------------------

                    console.log(`✅ Success! Credited ₦${nairaValue} to account ID: ${targetAccount._id}`);

                    // 11. UPDATE THE TRANSACTION RECORD WITH SNAPSHOTS
                    try {
                        const transactionRecord = await Transaction.findOneAndUpdate(
                            { 
                                user: targetAccount._id, 
                                amount: nairaValue, 
                                status: 'pending',
                                paymentPurpose: 'wallet_funding' 
                            },
                            { 
                                status: 'success', 
                                verifiedAt: new Date(),
                                provider: 'stellar',
                                gatewayResponse: JSON.stringify(payment),
                                // 🔐 SAVE SNAPSHOTS TO DB
                                balanceBefore: previousBalance, 
                                balanceAfter: newBalance        
                            },
                            { sort: { createdAt: -1 }, new: true } 
                        );

                        if (transactionRecord) {
                            console.log(`📝 Transaction record ${transactionRecord._id} marked as SUCCESS.`);
                        } else {
                            await Transaction.create({
                                user: targetAccount._id,
                                amount: nairaValue,
                                type: 'credit',
                                status: 'success',
                                paymentPurpose: 'wallet_funding',
                                description: 'Stellar Deposit (Auto-detected)',
                                reference: payment.id,
                                provider: 'stellar',
                                // 🔐 SAVE SNAPSHOTS TO DB
                                balanceBefore: previousBalance,
                                balanceAfter: newBalance
                            });
                            console.log(`🆕 No pending record found. Created new SUCCESS transaction.`);
                        }
                    } catch (dbErr) {
                        console.error('Failed to update transaction status in DB:', dbErr);
                    }

                    // Notifications...
                    try {
                        const isTaskerAccount = await Tasker.findOne({ stellarMemoId: cleanMemo });
                        if (isTaskerAccount) {
                            await notifyTaskerWalletFunded(targetAccount._id.toString(), nairaValue);
                        } else {
                            await notifyWalletFunded(targetAccount._id.toString(), nairaValue, 'stellar');
                        }
                    } catch (notifyErr) {
                        console.error('Failed to send deposit notification:', notifyErr);
                    }

                } catch (error) {
                    console.error('🚨 Error processing Stellar deposit:', error);
                    if (typeof Sentry !== 'undefined') Sentry.captureException(error);
                }
            },
            onerror: (error) => {
                console.error('🔌 Stellar stream error:', error);
            }
        });
};