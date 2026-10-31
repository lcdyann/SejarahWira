/**
 * ============================================================================
 * SejarahWira - Core Authentication Controller (authController.js)
 * ============================================================================
 * Architectural Tier : Application Tier (Backend Controller Module - BCE Pattern)
 * Route File Mapped   : backend/routes/authRoutes.js
 * Frontend Consumer  : assets/js/authEngine.js (login.html)
 * Domain Models Used : User (Parent Class), Student (Subclass), Teacher (Subclass)
 * Database Entities  : User, Student, Teacher, Avatar, Class
 * OOP Principles     : Encapsulation, Inheritance, Polymorphism, Static Methods
 * ----------------------------------------------------------------------------
 * Purpose:
 *   1. Authenticates users using Object-Oriented Domain Models (User, Student, Teacher).
 *   2. Validates incoming login requests for username, password, and role.
 *   3. Demonstrates Encapsulation via model-level password verification (`user.verifyPassword`).
 *   4. Demonstrates Polymorphism & Inheritance by instantiating role-specific child profiles.
 *   5. Returns unified session profiles for local storage persistence on the Presentation Tier.
 * ============================================================================
 */

import { User } from '../models/User.js';
import { Student } from '../models/Student.js';
import { Teacher } from '../models/Teacher.js';
import { signToken } from '../utils/authToken.js';
import { isAdminUsername } from '../utils/adminUtil.js';
import { SYSTEM_USERNAME } from '../models/Class.js';

/** the signed token + the profile the browser keeps (shared by login and sign-up) */
export async function issueSession(user, profile) {
  const payload = { userID: user.userID, role: user.role };
  if (user.role === 'Teacher') payload.teacherID = profile.teacherID;
  if (user.role === 'Student') payload.studentID = profile.studentID;
  // the entity keeps its attributes private, so the browser copy is a plain object built from toJSON()
  const out = { ...profile.toJSON(), token: signToken(payload) };
  if (user.role === 'Teacher') out.isAdmin = isAdminUsername(user.username);   // only to choose what to show; the server checks again
  return out;
}

/**
 * ============================================================================
 * ENDPOINT: POST /api/auth/login
 * ============================================================================
 * Handles user authentication across Student and Teacher actor roles using 
 * Domain-Driven Object-Oriented abstractions.
 * 
 * @param {Object} req - Express Request Object (req.body: { username, password, role })
 * @param {Object} res - Express Response Object
 * @returns {Promise<Response>} HTTP 200 with authenticated profile or 400/401/500 errors
 */
export const login = async (req, res) => {
  try {
    const { username, password, role } = req.body || {};

    // ------------------------------------------------------------------------
    // STEP 1: Payload Input Validation
    // ------------------------------------------------------------------------
    if (typeof username !== 'string' || typeof password !== 'string' || !['Student', 'Teacher'].includes(role)
        || !username || !password || username.length > 50 || password.length > 200) {
      return res.status(400).json({ 
        success: false, 
        message: 'Sila isi nama pengguna, kata laluan dan peranan!' 
      });
    }

    // ------------------------------------------------------------------------
    // STEP 2: OOP Static Finder Method Call (Parent Class: User)
    // Invokes static method on User entity to query database and instantiate User object.
    // ------------------------------------------------------------------------
    const user = username === SYSTEM_USERNAME ? null : await User.findByUsernameAndRole(username, role);   // the hidden public-class owner never logs in

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Nama pengguna atau kata laluan tidak sah!' 
      });
    }

    // ------------------------------------------------------------------------
    // STEP 3: OOP Encapsulation (Instance Method Call)
    // Delegating password hash/comparison directly to the User object instance.
    // ------------------------------------------------------------------------
    const isValidPassword = await user.verifyPassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Nama pengguna atau kata laluan tidak sah!' 
      });
    }

    // ------------------------------------------------------------------------
    // STEP 4: OOP Inheritance & Polymorphism
    // Dynamically retrieves polymorphic profile (Student vs Teacher) extending User class.
    // ------------------------------------------------------------------------
    let authenticatedUser;
    if (user.role === 'Student') {
      // Instantiates / fetches specialized Student profile subclass
      authenticatedUser = await Student.getProfile(user);
    } else if (user.role === 'Teacher') {
      // Instantiates / fetches specialized Teacher profile subclass
      authenticatedUser = await Teacher.getProfile(user);
    }

    // ------------------------------------------------------------------------
    // STEP 4b: Signed login token. Stored with the profile in localStorage and sent back as
    // "Authorization: Bearer <token>" so the backend can tell WHO is calling
    // (used by the teacher-only content management endpoints).
    // ------------------------------------------------------------------------
    const session = await issueSession(user, authenticatedUser);

    // ------------------------------------------------------------------------
    // STEP 5: Successful Authentication Response
    // ------------------------------------------------------------------------
    res.status(200).json({
      success: true,
      data: session
    });

  } catch (error) {
    console.error('OOP Auth Error:', error);
    res.status(500).json({ success: false, message: 'Log masuk gagal. Sila cuba lagi.' });
  }
};