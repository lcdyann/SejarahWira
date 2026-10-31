import express from 'express';
import { login } from '../controllers/authController.js';
import { loginLimiter, registerLimiter, resetLimiter, forgotLimiter, verifyTryLimiter } from '../middleware/loginLimiter.js';
import { registerStudent, registerTeacher, sendTeacherVerifyCode } from '../controllers/registerController.js';
import { issueResetCode, redeemResetCode, forgotByEmail } from '../controllers/resetController.js';
import { requireTeacher } from '../middleware/requireTeacher.js';

const router = express.Router();

/** public sign-up is open unless .env says ENABLE_SIGNUP=false */
const signupOn = () => String(process.env.ENABLE_SIGNUP || 'true').toLowerCase() !== 'false';
const onlyWhenSignupOn = (req, res, next) => (signupOn() ? next() : res.status(404).json({ success: false, message: 'Pendaftaran sendiri tidak dibuka.' }));
router.get('/config', (req, res) => res.json({ success: true, signup: signupOn() }));

router.post('/login', loginLimiter, login);
router.post('/register-student', onlyWhenSignupOn, registerLimiter, registerStudent);   // learn without a teacher: class PUBLIC/0000
router.post('/reset-code', requireTeacher, issueResetCode);      // teacher / admin hands out a one-time code
router.post('/forgot', forgotLimiter, forgotByEmail);           // hantar kod ke e-mel berdaftar
router.post('/reset-password', resetLimiter, redeemResetCode);   // the person who forgot uses it
router.post('/verify-teacher-email', onlyWhenSignupOn, forgotLimiter, sendTeacherVerifyCode);   // 1. hantar kod ke e-mel guru
router.post('/register-teacher', onlyWhenSignupOn, verifyTryLimiter, registerLimiter, registerTeacher);   // 2. daftar dengan kod itu

// tokens are stateless: the browser forgets its token. This only answers 200 so the logout button has nothing to fail on.
router.all('/logout', (req, res) => res.json({ success: true }));

export default router;
