import { Router } from 'express';
import {
  createExamSchedule,
  createExamSession,
  deleteExamSchedule,
  deleteExamSession,
  getExamScheduleMarksRoster,
  getExamsOverview,
  listExamMarks,
  listExamSchedules,
  listExamSessions,
  publishExamMarks,
  recordBulkExamMarks,
  updateExamSchedule,
  updateExamSession,
} from '../controllers/examController.ts';
import { authenticate, requirePasswordUpdated } from '../middleware/authMiddleware.ts';

export const examRouter = Router();

examRouter.use(authenticate, requirePasswordUpdated);

examRouter.get('/overview', getExamsOverview);

examRouter.get('/sessions', listExamSessions);
examRouter.post('/sessions', createExamSession);
examRouter.patch('/sessions/:id', updateExamSession);
examRouter.delete('/sessions/:id', deleteExamSession);

examRouter.get('/schedules', listExamSchedules);
examRouter.post('/schedules', createExamSchedule);
examRouter.patch('/schedules/:id', updateExamSchedule);
examRouter.delete('/schedules/:id', deleteExamSchedule);

examRouter.get('/schedules/:id/marks', getExamScheduleMarksRoster);
examRouter.post('/schedules/:id/marks/bulk', recordBulkExamMarks);

examRouter.get('/marks', listExamMarks);
examRouter.patch('/marks/publish', publishExamMarks);
