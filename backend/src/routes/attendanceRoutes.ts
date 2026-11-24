import { Router } from 'express';
import {
  deleteAttendanceRecord,
  followUpAbsenceWarning,
  generateBatchStudentQr,
  generateStudentQr,
  getClassRollCall,
  getTeacherRollCall,
  listAbsenceWarnings,
  listAttendance,
  recordAttendance,
  recordBulkAttendance,
  recordBulkTeacherAttendance,
  scanAbsenceWarnings,
} from '../controllers/attendanceController.ts';
import {
  authenticate,
  requirePasswordUpdated,
  requirePermission,
} from '../middleware/authMiddleware.ts';

export const attendanceRouter = Router();
attendanceRouter.use(authenticate);
attendanceRouter.use(requirePasswordUpdated);

attendanceRouter.get('/', listAttendance);
attendanceRouter.get('/roll-call', getClassRollCall);
attendanceRouter.post('/bulk', recordBulkAttendance);
attendanceRouter.get('/teachers/roll-call', getTeacherRollCall);
attendanceRouter.post('/teachers/bulk', recordBulkTeacherAttendance);
attendanceRouter.get('/warnings', listAbsenceWarnings);
attendanceRouter.post('/warnings/scan', scanAbsenceWarnings);
attendanceRouter.patch('/warnings/:id/follow-up', followUpAbsenceWarning);
attendanceRouter.get('/qr/:studentId', generateStudentQr);
attendanceRouter.post('/qr/batch', generateBatchStudentQr);
attendanceRouter.post('/record', recordAttendance);
attendanceRouter.delete('/:id', requirePermission('attendance', 'delete'), deleteAttendanceRecord);
