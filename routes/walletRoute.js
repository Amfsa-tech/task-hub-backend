import { Router } from 'express';
import { protectUser, protectTasker } from '../middlewares/authMiddleware.js';
import { initializeFunding, verifyFunding, getUserBalance, getUserTransactions } from '../controllers/walletController.js';
import { handlePaystackWebhook } from '../controllers/paystackWebhookController.js';
import { verifyPaystackSignature } from '../middlewares/paystackWebhookAuth.js';
import {
    getTaskerBalance,
    setBankAccount,
    getBankAccount,
    requestWithdrawal,
    getWithdrawalHistory,
    listBanks
} from '../controllers/withdrawalController.js';

const router = Router();

// User-facing endpoints (JWT protected)
router.post('/fund/initialize', protectUser, initializeFunding);
router.get('/fund/verify', protectUser, verifyFunding);

// User wallet & transaction endpoints
router.get('/user/balance', protectUser, getUserBalance);
router.get('/user/transactions', protectUser, getUserTransactions);

// Paystack webhook — no JWT auth, verified by HMAC signature
router.post('/paystack-webhook', verifyPaystackSignature, handlePaystackWebhook);

// Bank list (tasker auth required)
router.get('/banks', protectTasker, listBanks);

// Tasker wallet & withdrawal endpoints
router.get('/tasker/balance', protectTasker, getTaskerBalance);
router.get('/tasker/bank-account', protectTasker, getBankAccount);
router.post('/tasker/bank-account', protectTasker, setBankAccount);
router.post('/tasker/withdraw', protectTasker, requestWithdrawal);
router.get('/tasker/withdrawals', protectTasker, getWithdrawalHistory);

export default router;
