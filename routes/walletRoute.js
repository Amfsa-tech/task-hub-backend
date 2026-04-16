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
    setupTransactionPin
} from '../controllers/walletController.js';

// TODO: Ensure this import matches the exact name and path of your authentication middleware
import { protectAny } from '../middlewares/authMiddleware.js'; 

const router = express.Router();

// ==========================================
// SECURITY: Protect all wallet routes
// ==========================================
// Every route below this line requires the user to be logged in with a valid token
router.use(protectAny);

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
// Returns Master Public Key and User's Memo ID for the QR code screen
router.get('/stellar/deposit-info', getStellarDepositInfo);

// POST /api/wallet/withdraw
// Submits a withdrawal request (handles both Bank Transfers and Stellar Crypto)
router.post('/withdraw', requestWithdrawal);
// TASKER BALANCES & HISTORY (NEW)
// ==========================================
router.get('/tasker/balance', getTaskerBalance);
router.get('/tasker/transactions', getTaskerTransactions);
router.post('/tasker/pin/setup', setupTransactionPin);

export default router;