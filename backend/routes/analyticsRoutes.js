import express from 'express';
import { protectParams } from '../utils/inputGuard.js';
import { requireTeacher } from '../middleware/requireTeacher.js';
import { getSummary, getStudentDetail, getThresholds, updateThreshold } from '../controllers/analyticsController.js';

/**
 * UC-11 Monitor Student Performance.  server.js:  app.use('/api/analytics', analyticsRoutes)
 *   GET /summary?eraID=&classID=
 *   GET /student/:studentID
 *   GET /thresholds, PUT /thresholds   (Great Siege pass mark + artifact mark, one pair for all eras)
 */
const router = express.Router();
protectParams(router);      // ID dalam alamat mesti nombor / bentuk ID yang sah (utils/inputGuard.js)
router.use(requireTeacher);
router.get('/summary', getSummary);
router.get('/student/:studentID', getStudentDetail);
router.get('/thresholds', getThresholds);
router.put('/thresholds', updateThreshold);
export default router;