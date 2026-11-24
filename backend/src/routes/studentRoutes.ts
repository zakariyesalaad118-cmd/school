import { Router } from 'express';
import {
  createStudent,
  deleteStudent,
  getStudentById,
  listStudents,
  updateStudent,
  updateStudentStatus,
  uploadStudentPhoto,
} from '../controllers/studentController.ts';
import {
  listAcademicResults,
  previewStudentPromotion,
  processAcademicResults,
  promoteStudents,
} from '../controllers/studentPromotionController.ts';
import { authenticate, requirePasswordUpdated, requirePermission } from '../middleware/authMiddleware.ts';

export const studentRouter = Router();
studentRouter.use(authenticate);
studentRouter.use(requirePasswordUpdated);

studentRouter.get('/', requirePermission('students', 'view'), listStudents);
studentRouter.get('/results', requirePermission('students', 'view'), listAcademicResults);
studentRouter.post('/results/process', processAcademicResults);
studentRouter.get('/promotion/preview', requirePermission('students', 'edit'), previewStudentPromotion);
studentRouter.post('/promote', requirePermission('students', 'edit'), promoteStudents);
studentRouter.get('/:id', requirePermission('students', 'view'), getStudentById);
studentRouter.post('/', requirePermission('students', 'create'), createStudent);
studentRouter.patch('/:id', requirePermission('students', 'edit'), updateStudent);
studentRouter.patch('/:id/status', requirePermission('students', 'edit'), updateStudentStatus);
studentRouter.post('/:id/photo', requirePermission('students', 'edit'), uploadStudentPhoto);
studentRouter.delete('/:id', requirePermission('students', 'delete'), deleteStudent);

