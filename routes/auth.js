import express from 'express';
import {registerUser, loginUser, registerAdmin, loginAdmin} from '../controllers/auth.js';

const router = express.Router();

// User Registration
router.post('/user/register', registerUser);

// User Login
router.post('/user/login', loginUser);

// Admin Registration
router.post('/admin/register', registerAdmin);

// Admin Login
router.post('/admin/login', loginAdmin);

export default router;
