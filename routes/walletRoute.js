import express from 'express';
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
    getBanks,               // <-- ADDED BACK
    getTaskerBankAccount    // <-- ADDED BACK
} from '../controllers/walletController.js';

import { setBankAccount } from '../controllers/withdrawalController.js';

import { protectAny } from '../middlewares/authMiddleware.js'; 

const router = express.Router();

// ==========================================
// SECURITY: Protect all wallet routes
// ==========================================
router.use(protectAny);

// ==========================================
// BANK LIST
// ==========================================
// GET /api/wallet/banks
router.get('/banks', getBanks);

// ==========================================
// FIAT FUNDING (PAYSTACK)
// ==========================================
// POST /api/wallet/fund/initialize
router.post('/fund/initialize', initializeFunding);

// GET /api/wallet/fund/verify?reference=...
router.get('/fund/verify', verifyFunding);

// ==========================================
// USER BALANCES & HISTORY
// ==========================================
// GET /api/wallet/user/balance
router.get('/user/balance', getUserBalance);

// GET /api/wallet/user/transactions
router.get('/user/transactions', getUserTransactions);

// ==========================================
// CRYPTO BRIDGE (STELLAR DEPOSITS & WITHDRAWALS)
// ==========================================
// GET /api/wallet/stellar/deposit-info
router.get('/stellar/deposit-info', getStellarDepositInfo);

// POST /api/wallet/withdraw
router.post('/withdraw', requestWithdrawal);

// ==========================================
// TASKER BALANCES, BANK & HISTORY 
// ==========================================
// GET /api/wallet/tasker/bank-account
router.get('/tasker/bank-account', getTaskerBankAccount);

// POST /api/wallet/tasker/bank-account
router.post('/tasker/bank-account', setBankAccount);

router.get('/tasker/balance', getTaskerBalance);
router.get('/tasker/transactions', getTaskerTransactions);
router.post('/tasker/pin/setup', setupTransactionPin);

export default router;