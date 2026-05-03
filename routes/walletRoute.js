import express from 'express';
import rateLimit from 'express-rate-limit'; // NEW IMPORT
import {
    initializeFunding,
    verifyFunding,
    getUserBalance,
    getUserTransactions,
    getStellarDepositInfo,
    requestWithdrawal,
    getTaskerBalance,
    getTaskerTransactions,
    setupTransactionPin,
    getBanks,               
    getTaskerBankAccount    
} from '../controllers/walletController.js';

import { setBankAccount } from '../controllers/withdrawalController.js';
import { protectAny } from '../middlewares/authMiddleware.js'; 

const router = express.Router();

// ==========================================
// SECURITY: Rate Limiters
// ==========================================
// Limits to 5 payment initializations per 5 minutes per IP
const paymentInitLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, 
    max: 5, 
    message: { status: 'error', message: 'Too many payment requests. Please try again in 5 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Limits to 3 withdrawal requests per hour per IP
const withdrawalLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 3, 
    message: { status: 'error', message: 'Withdrawal rate limit exceeded. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.use(protectAny);

// ==========================================
// BANK LIST
// ==========================================
router.get('/banks', getBanks);

// ==========================================
// FIAT FUNDING (DYNAMIC FLUTTERWAVE/PAYSTACK)
// ==========================================
// Apply the rate limiter directly to the initialize route
router.post('/fund/initialize', paymentInitLimiter, initializeFunding);
router.get('/fund/verify', verifyFunding);

// ==========================================
// USER BALANCES & HISTORY
// ==========================================
router.get('/user/balance', getUserBalance);
router.get('/user/transactions', getUserTransactions);

// ==========================================
// CRYPTO BRIDGE (STELLAR DEPOSITS & WITHDRAWALS)
// ==========================================
router.get('/stellar/deposit-info', getStellarDepositInfo);
// Apply limiter to withdrawals
router.post('/withdraw', withdrawalLimiter, requestWithdrawal);

// ==========================================
// TASKER BALANCES, BANK & HISTORY 
// ==========================================
router.get('/tasker/bank-account', getTaskerBankAccount);
router.post('/tasker/bank-account', setBankAccount);
router.get('/tasker/balance', getTaskerBalance);
router.get('/tasker/transactions', getTaskerTransactions);
router.post('/tasker/pin/setup', setupTransactionPin);

export default router;