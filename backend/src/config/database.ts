import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from './env.ts';
import { MongooseModels } from '../models/mongooseModels.ts';
import type {
  IAbsenceWarning,
  IAcademicResult,
  IAttendanceRecord,
  IAuditLog,
  IDashboardConfiguration,
  IDepartment,
  IExamMark,
  IExamSchedule,
  IExamSession,
  ILoginHistory,
  IPasswordResetToken,
  IRole,
  ISchoolSettings,
  IStudent,
  ITeacherAttendanceRecord,
  IUser,
} from '../types/models.ts';

interface LocalStoreData {
  users: IUser[];
  roles: IRole[];
  departments: IDepartment[];
  dashboards: IDashboardConfiguration[];
  schoolSettings: ISchoolSettings[];
  loginHistory: ILoginHistory[];
  auditLogs: IAuditLog[];
  passwordResets: IPasswordResetToken[];
  students: IStudent[];
  academicResults: IAcademicResult[];
  attendance: IAttendanceRecord[];
  teacherAttendance: ITeacherAttendanceRecord[];
  absenceWarnings: IAbsenceWarning[];
  examSessions: IExamSession[];
  examSchedules: IExamSchedule[];
  examMarks: IExamMark[];
}

const DATA_DIR = path.resolve(process.cwd(), 'backend', 'data');
const STORE_PATH = path.join(DATA_DIR, 'nexus-db.json');

const EMPTY_STORE: LocalStoreData = {
  users: [],
  roles: [],
  departments: [],
  dashboards: [],
  schoolSettings: [],
  loginHistory: [],
  auditLogs: [],
  passwordResets: [],
  students: [],
  academicResults: [],
  attendance: [],
  teacherAttendance: [],
  absenceWarnings: [],
  examSessions: [],
  examSchedules: [],
  examMarks: [],
};

let engineMode: 'mongodb' | 'local-store' = 'local-store';
let localCache: LocalStoreData | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function ensureLocalLoaded(): Promise<LocalStoreData> {
  if (localCache) return localCache;
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalStoreData>;
    localCache = {
      users: parsed.users || [],
      roles: parsed.roles || [],
      departments: parsed.departments || [],
      dashboards: parsed.dashboards || [],
      schoolSettings: parsed.schoolSettings || [],
      loginHistory: parsed.loginHistory || [],
      auditLogs: parsed.auditLogs || [],
      passwordResets: parsed.passwordResets || [],
      students: parsed.students || [],
      academicResults: parsed.academicResults || [],
      attendance: parsed.attendance || [],
      teacherAttendance: parsed.teacherAttendance || [],
      absenceWarnings: parsed.absenceWarnings || [],
      examSessions: parsed.examSessions || [],
      examSchedules: parsed.examSchedules || [],
      examMarks: parsed.examMarks || [],
    };
  } catch {
    localCache = structuredClone(EMPTY_STORE);
    await persistLocalStore();
  }
  return localCache;
}

async function persistLocalStore(): Promise<void> {
  if (!localCache) return;
  const snapshot = JSON.stringify(localCache, null, 2);
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmpPath = `${STORE_PATH}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, snapshot, 'utf8');
    await fs.rename(tmpPath, STORE_PATH);
  });
  await writeQueue;
}

function mapDoc<T>(doc: any): T {
  if (!doc) return doc;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  if (obj._id !== undefined && obj.id === undefined) {
    obj.id = String(obj._id);
  }
  delete obj._id;
  return obj as T;
}

function matchesFilter<T extends Record<string, any>>(item: T, filter: Partial<T>): boolean {
  for (const [k, v] of Object.entries(filter)) {
    if (v === undefined) continue;
    if (item[k] !== v) return false;
  }
  return true;
}

class Repository<T extends { id: string }> {
  private readonly collectionKey: keyof LocalStoreData;
  private readonly mongooseModel: any;

  constructor(collectionKey: keyof LocalStoreData, mongooseModel: any) {
    this.collectionKey = collectionKey;
    this.mongooseModel = mongooseModel;
  }

  async findAll(filter: Partial<T> = {}): Promise<T[]> {
    if (engineMode === 'mongodb') {
      const docs = await this.mongooseModel.find(filter).lean();
      return docs.map((d: any) => mapDoc<T>(d));
    }
    const store = await ensureLocalLoaded();
    const list = store[this.collectionKey] as unknown as T[];
    return list.filter((item) => matchesFilter(item, filter)).map((item) => structuredClone(item));
  }

  async findOne(filter: Partial<T>): Promise<T | null> {
    if (engineMode === 'mongodb') {
      const doc = await this.mongooseModel.findOne(filter).lean();
      return doc ? mapDoc<T>(doc) : null;
    }
    const store = await ensureLocalLoaded();
    const list = store[this.collectionKey] as unknown as T[];
    const found = list.find((item) => matchesFilter(item, filter));
    return found ? structuredClone(found) : null;
  }

  async findById(id: string): Promise<T | null> {
    if (engineMode === 'mongodb') {
      const doc = await this.mongooseModel.findById(id).lean();
      return doc ? mapDoc<T>(doc) : null;
    }
    const store = await ensureLocalLoaded();
    const list = store[this.collectionKey] as unknown as T[];
    const found = list.find((item) => item.id === id);
    return found ? structuredClone(found) : null;
  }

  async create(data: T): Promise<T> {
    if (engineMode === 'mongodb') {
      const { id, ...rest } = data as any;
      const created = await this.mongooseModel.create({ _id: id, ...rest });
      return mapDoc<T>(created);
    }
    const store = await ensureLocalLoaded();
    const list = store[this.collectionKey] as unknown as T[];
    list.push(structuredClone(data));
    await persistLocalStore();
    return structuredClone(data);
  }

  async updateById(id: string, updates: Partial<T>): Promise<T | null> {
    if (engineMode === 'mongodb') {
      const updated = await this.mongooseModel
        .findByIdAndUpdate(id, { $set: updates }, { new: true })
        .lean();
      return updated ? mapDoc<T>(updated) : null;
    }
    const store = await ensureLocalLoaded();
    const list = store[this.collectionKey] as unknown as T[];
    const idx = list.findIndex((item) => item.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...structuredClone(updates), id };
    await persistLocalStore();
    return structuredClone(list[idx]);
  }

  async deleteById(id: string): Promise<boolean> {
    if (engineMode === 'mongodb') {
      const res = await this.mongooseModel.deleteOne({ _id: id });
      return res.deletedCount > 0;
    }
    const store = await ensureLocalLoaded();
    const list = store[this.collectionKey] as unknown as T[];
    const idx = list.findIndex((item) => item.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    await persistLocalStore();
    return true;
  }

  async count(filter: Partial<T> = {}): Promise<number> {
    if (engineMode === 'mongodb') {
      return this.mongooseModel.countDocuments(filter);
    }
    const store = await ensureLocalLoaded();
    const list = store[this.collectionKey] as unknown as T[];
    return list.filter((item) => matchesFilter(item, filter)).length;
  }
}

export const db = {
  users: new Repository<IUser>('users', MongooseModels.User),
  roles: new Repository<IRole>('roles', MongooseModels.Role),
  departments: new Repository<IDepartment>('departments', MongooseModels.Department),
  dashboards: new Repository<IDashboardConfiguration>(
    'dashboards',
    MongooseModels.DashboardConfiguration
  ),
  schoolSettings: new Repository<ISchoolSettings>('schoolSettings', MongooseModels.SchoolSettings),
  loginHistory: new Repository<ILoginHistory>('loginHistory', MongooseModels.LoginHistory),
  auditLogs: new Repository<IAuditLog>('auditLogs', MongooseModels.AuditLog),
  passwordResets: new Repository<IPasswordResetToken>(
    'passwordResets',
    MongooseModels.PasswordResetToken
  ),
  students: new Repository<IStudent>('students', MongooseModels.Student),
  academicResults: new Repository<IAcademicResult>(
    'academicResults',
    MongooseModels.AcademicResult
  ),
  attendance: new Repository<IAttendanceRecord>('attendance', MongooseModels.Attendance),
  teacherAttendance: new Repository<ITeacherAttendanceRecord>(
    'teacherAttendance',
    MongooseModels.TeacherAttendance
  ),
  absenceWarnings: new Repository<IAbsenceWarning>(
    'absenceWarnings',
    MongooseModels.AbsenceWarning
  ),
  examSessions: new Repository<IExamSession>('examSessions', MongooseModels.ExamSession),
  examSchedules: new Repository<IExamSchedule>('examSchedules', MongooseModels.ExamSchedule),
  examMarks: new Repository<IExamMark>('examMarks', MongooseModels.ExamMark),
};

export async function connectDatabase(): Promise<'mongodb' | 'local-store'> {
  if (env.mongodbUri) {
    try {
      await mongoose.connect(env.mongodbUri, {
        serverSelectionTimeoutMS: 5000,
      });
      engineMode = 'mongodb';
      console.log('[NEXUS DB] Connected to MongoDB Atlas');
      return engineMode;
    } catch (error) {
      console.warn(
        '[NEXUS DB] MongoDB connection failed, falling back to local persistent store:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  await ensureLocalLoaded();
  engineMode = 'local-store';
  console.log('[NEXUS DB] Active on persistent local document store (backend/data/nexus-db.json)');
  return engineMode;
}

export function getDatabaseEngineMode(): 'mongodb' | 'local-store' {
  return engineMode;
}
