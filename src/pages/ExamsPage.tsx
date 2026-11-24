import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Award,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardEdit,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Button, Card, Input, Label, Modal, Select } from '../components/ui/Primitives';
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../contexts/BrandingContext';
import { apiRequest } from '../services/api';
import type {
  ExamInvigilatorOption,
  ExamMarkRecord,
  ExamMarksRosterItem,
  ExamMarksRosterResponse,
  ExamOverviewResponse,
  ExamScheduleRecord,
  ExamScheduleStatus,
  ExamSessionRecord,
  ExamSittingStatus,
  ExamTerm,
} from '../types/nexus';
import { cn } from '../utils/cn';

type ExamsTab = 'overview' | 'timetable' | 'marks' | 'results';

const GRADE_OPTIONS_PRIMARY = [
  'Grade 1',
  'Grade 2',
  'Grade 3',
  'Grade 4',
  'Grade 5',
  'Grade 6',
  'Grade 7',
  'Grade 8',
];
const GRADE_OPTIONS_SECONDARY = ['Form 1', 'Form 2', 'Form 3', 'Form 4'];
const ALL_GRADES = [...GRADE_OPTIONS_PRIMARY, ...GRADE_OPTIONS_SECONDARY];
const EXAM_TERMS: ExamTerm[] = ['Term 1', 'Term 2', 'Midterm', 'Final', 'Annual'];

function computeClientGradeLetter(pct: number): string {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 75) return 'B+';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C+';
  if (pct >= 50) return 'C';
  if (pct >= 40) return 'D';
  return 'F';
}

function getDefaultAcademicYear(): string {
  const year = new Date().getFullYear();
  return `${year}-${year + 1}`;
}

export function ExamsPage() {
  const { t } = useTranslation();
  const { user, role, can } = useAuth();
  const { settings } = useBranding();

  const isPortalRestricted =
    !user?.isSuperAdmin &&
    !role?.isSuperAdminRole &&
    (role?.slug === 'student' || role?.slug === 'parent');

  const canManageSchedules =
    !isPortalRestricted &&
    (can('exams', 'create') || can('exams', 'edit') || can('exams', 'manage'));
  const canDeleteSchedules =
    !isPortalRestricted && (can('exams', 'delete') || can('exams', 'manage'));
  const canApprovePublish =
    !isPortalRestricted && (can('exams', 'approve') || can('exams', 'manage'));

  const [activeTab, setActiveTab] = useState<ExamsTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [overview, setOverview] = useState<ExamOverviewResponse | null>(null);
  const [schedules, setSchedules] = useState<ExamScheduleRecord[]>([]);
  const [marks, setMarks] = useState<ExamMarkRecord[]>([]);

  // Timetable filters
  const [schSearch, setSchSearch] = useState('');
  const [schYear, setSchYear] = useState('');
  const [schGrade, setSchGrade] = useState('');
  const [schTerm, setSchTerm] = useState('');
  const [schStatus, setSchStatus] = useState('');

  // Results filters
  const [resSearch, setResSearch] = useState('');
  const [resYear, setResYear] = useState('');
  const [resGrade, setResGrade] = useState('');
  const [resTerm, setResTerm] = useState('');
  const [resStatus, setResStatus] = useState('');

  // Schedule Modal State
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleFormError, setScheduleFormError] = useState<string | null>(null);
  const [schForm, setSchForm] = useState({
    examSessionId: '',
    examTitle: `${getDefaultAcademicYear()} Midterm Examination`,
    academicYear: getDefaultAcademicYear(),
    term: 'Midterm' as ExamTerm,
    division: 'Secondary' as 'Primary' | 'Secondary',
    gradeLevel: 'Form 1',
    section: 'All',
    subjectName: '',
    subjectCode: '',
    examDate: new Date().toISOString().slice(0, 10),
    startTime: '08:30',
    endTime: '10:30',
    room: 'Hall A',
    invigilatorId: '',
    maxMarks: 100,
    passMarks: 50,
    status: 'scheduled' as ExamScheduleStatus,
    notes: '',
  });

  // Session Modal State
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState({
    title: `${getDefaultAcademicYear()} Midterm Examinations`,
    academicYear: getDefaultAcademicYear(),
    term: 'Midterm' as ExamTerm,
    division: 'All' as 'All' | 'Primary' | 'Secondary',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    description: '',
  });

  // Marks Entry State
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterData, setRosterData] = useState<ExamMarksRosterResponse | null>(null);
  const [draftMarks, setDraftMarks] = useState<
    Record<string, { score: string; attendanceStatus: ExamSittingStatus; remarks: string }>
  >({});
  const [savingMarks, setSavingMarks] = useState(false);
  const [publishingMarks, setPublishingMarks] = useState(false);
  const [syncPromotionOnPublish, setSyncPromotionOnPublish] = useState(true);

  // Report card modal
  const [reportCardStudentId, setReportCardStudentId] = useState<string | null>(null);

  const loadAllExamData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, schRes, mkRes] = await Promise.all([
        apiRequest<ExamOverviewResponse>('/api/exams/overview'),
        apiRequest<{ schedules: ExamScheduleRecord[] }>('/api/exams/schedules'),
        apiRequest<{ marks: ExamMarkRecord[] }>('/api/exams/marks'),
      ]);
      setOverview(ovRes);
      setSchedules(schRes.schedules);
      setMarks(mkRes.marks);
      if (!selectedScheduleId && schRes.schedules.length > 0) {
        setSelectedScheduleId(schRes.schedules[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllExamData();
  }, []);

  const loadRoster = async (scheduleId: string) => {
    if (!scheduleId || isPortalRestricted) {
      setRosterData(null);
      return;
    }
    setRosterLoading(true);
    try {
      const res = await apiRequest<ExamMarksRosterResponse>(
        `/api/exams/schedules/${scheduleId}/marks`
      );
      setRosterData(res);
      const nextDrafts: Record<
        string,
        { score: string; attendanceStatus: ExamSittingStatus; remarks: string }
      > = {};
      for (const item of res.roster) {
        nextDrafts[item.student.id] = {
          score: item.mark ? String(item.mark.score) : '',
          attendanceStatus: item.mark?.attendanceStatus || 'sat',
          remarks: item.mark?.remarks || '',
        };
      }
      setDraftMarks(nextDrafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setRosterLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'marks' && selectedScheduleId && !isPortalRestricted) {
      loadRoster(selectedScheduleId);
    }
  }, [activeTab, selectedScheduleId]);

  const academicYearOptions = useMemo(() => {
    const set = new Set<string>([getDefaultAcademicYear()]);
    for (const s of schedules) set.add(s.academicYear);
    for (const m of marks) set.add(m.academicYear);
    return Array.from(set).sort().reverse();
  }, [schedules, marks]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      if (schYear && s.academicYear !== schYear) return false;
      if (schGrade && s.gradeLevel !== schGrade) return false;
      if (schTerm && s.term !== schTerm) return false;
      if (schStatus && s.status !== schStatus) return false;
      if (schSearch.trim()) {
        const q = schSearch.trim().toLowerCase();
        const hit =
          s.subjectName.toLowerCase().includes(q) ||
          s.subjectCode.toLowerCase().includes(q) ||
          s.examTitle.toLowerCase().includes(q) ||
          s.gradeLevel.toLowerCase().includes(q) ||
          s.room.toLowerCase().includes(q) ||
          s.invigilatorName.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [schedules, schYear, schGrade, schTerm, schStatus, schSearch]);

  const filteredMarks = useMemo(() => {
    return marks.filter((m) => {
      if (resYear && m.academicYear !== resYear) return false;
      if (resGrade && m.gradeLevel !== resGrade) return false;
      if (resTerm && m.term !== resTerm) return false;
      if (resStatus && m.status !== resStatus) return false;
      if (resSearch.trim()) {
        const q = resSearch.trim().toLowerCase();
        const hit =
          m.studentName.toLowerCase().includes(q) ||
          m.studentCode.toLowerCase().includes(q) ||
          m.subjectName.toLowerCase().includes(q) ||
          m.examTitle.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [marks, resYear, resGrade, resTerm, resStatus, resSearch]);

  const openCreateScheduleModal = () => {
    setEditingScheduleId(null);
    setScheduleFormError(null);
    const firstSession = overview?.sessions?.[0];
    setSchForm({
      examSessionId: firstSession?.id || '',
      examTitle: firstSession?.title || `${getDefaultAcademicYear()} Midterm Examination`,
      academicYear: firstSession?.academicYear || getDefaultAcademicYear(),
      term: firstSession?.term || 'Midterm',
      division: 'Secondary',
      gradeLevel: 'Form 1',
      section: 'All',
      subjectName: '',
      subjectCode: '',
      examDate: firstSession?.startDate || new Date().toISOString().slice(0, 10),
      startTime: '08:30',
      endTime: '10:30',
      room: 'Hall A',
      invigilatorId: '',
      maxMarks: 100,
      passMarks: 50,
      status: 'scheduled',
      notes: '',
    });
    setScheduleModalOpen(true);
  };

  const openEditScheduleModal = (sch: ExamScheduleRecord) => {
    setEditingScheduleId(sch.id);
    setScheduleFormError(null);
    setSchForm({
      examSessionId: sch.examSessionId || '',
      examTitle: sch.examTitle,
      academicYear: sch.academicYear,
      term: sch.term,
      division: sch.division,
      gradeLevel: sch.gradeLevel,
      section: sch.section,
      subjectName: sch.subjectName,
      subjectCode: sch.subjectCode,
      examDate: sch.examDate,
      startTime: sch.startTime,
      endTime: sch.endTime,
      room: sch.room,
      invigilatorId: sch.invigilatorId || '',
      maxMarks: sch.maxMarks,
      passMarks: sch.passMarks,
      status: sch.status,
      notes: sch.notes,
    });
    setScheduleModalOpen(true);
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSchedule(true);
    setScheduleFormError(null);
    try {
      const payload = {
        ...schForm,
        examSessionId: schForm.examSessionId || null,
        invigilatorId: schForm.invigilatorId || null,
        maxMarks: Number(schForm.maxMarks),
        passMarks: Number(schForm.passMarks),
      };
      if (editingScheduleId) {
        await apiRequest(`/api/exams/schedules/${editingScheduleId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/api/exams/schedules', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setScheduleModalOpen(false);
      setFeedback(t('common.savedSuccess'));
      await loadAllExamData();
    } catch (err) {
      setScheduleFormError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!window.confirm(t('exams.confirmDeleteSchedule'))) return;
    try {
      await apiRequest(`/api/exams/schedules/${id}`, { method: 'DELETE' });
      if (selectedScheduleId === id) setSelectedScheduleId('');
      await loadAllExamData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    }
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSession(true);
    setSessionError(null);
    try {
      await apiRequest('/api/exams/sessions', {
        method: 'POST',
        body: JSON.stringify(sessionForm),
      });
      setSessionModalOpen(false);
      setFeedback(t('common.savedSuccess'));
      await loadAllExamData();
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSavingSession(false);
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!window.confirm(t('exams.confirmDeleteSession'))) return;
    try {
      await apiRequest(`/api/exams/sessions/${id}`, { method: 'DELETE' });
      await loadAllExamData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    }
  };

  const handleSaveMarks = async (submitStatus: 'draft' | 'submitted') => {
    if (!rosterData) return;
    const entries = rosterData.roster
      .map((item) => {
        const d = draftMarks[item.student.id];
        if (!d) return null;
        if (d.attendanceStatus === 'sat' && d.score.trim() === '') return null;
        const parsedScore = d.attendanceStatus === 'sat' ? Number(d.score) : 0;
        if (Number.isNaN(parsedScore) || parsedScore < 0) return null;
        return {
          studentId: item.student.id,
          score: parsedScore,
          attendanceStatus: d.attendanceStatus,
          remarks: d.remarks || '',
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    if (entries.length === 0) {
      setError(t('common.requiredField'));
      return;
    }

    setSavingMarks(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await apiRequest<{ count: number }>(
        `/api/exams/schedules/${rosterData.schedule.id}/marks/bulk`,
        {
          method: 'POST',
          body: JSON.stringify({ submitStatus, entries }),
        }
      );
      setFeedback(t('exams.marksSavedMsg', { count: res.count }));
      await Promise.all([loadRoster(rosterData.schedule.id), loadAllExamData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSavingMarks(false);
    }
  };

  const handlePublishAction = async (action: 'publish' | 'return_draft') => {
    if (!rosterData) return;
    setPublishingMarks(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await apiRequest<{ updatedCount: number; syncedAcademicResultsCount: number }>(
        '/api/exams/marks/publish',
        {
          method: 'PATCH',
          body: JSON.stringify({
            examScheduleId: rosterData.schedule.id,
            action,
            syncAnnualResults: syncPromotionOnPublish,
          }),
        }
      );
      setFeedback(
        action === 'publish'
          ? t('exams.marksPublishedMsg', {
              count: res.updatedCount,
              synced: res.syncedAcademicResultsCount,
            })
          : t('common.savedSuccess')
      );
      await Promise.all([loadRoster(rosterData.schedule.id), loadAllExamData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setPublishingMarks(false);
    }
  };

  const exportTimetableCsv = () => {
    const header = [
      'Exam Title',
      'Academic Year',
      'Term',
      'Division',
      'Grade',
      'Section',
      'Subject',
      'Code',
      'Date',
      'Start Time',
      'End Time',
      'Room',
      'Invigilator',
      'Max Marks',
      'Pass Marks',
      'Status',
    ];
    const rows = filteredSchedules.map((s) => [
      s.examTitle,
      s.academicYear,
      s.term,
      s.division,
      s.gradeLevel,
      s.section,
      s.subjectName,
      s.subjectCode,
      s.examDate,
      s.startTime,
      s.endTime,
      s.room,
      s.invigilatorName,
      s.maxMarks,
      s.passMarks,
      s.status,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `exam-timetable-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportResultsCsv = () => {
    const header = [
      'Student ID',
      'Student Name',
      'Grade',
      'Section',
      'Exam Title',
      'Academic Year',
      'Term',
      'Subject',
      'Score',
      'Max Marks',
      'Percentage',
      'Grade Letter',
      'Result',
      'Status',
    ];
    const rows = filteredMarks.map((m) => [
      m.studentCode,
      m.studentName,
      m.gradeLevel,
      m.section,
      m.examTitle,
      m.academicYear,
      m.term,
      m.subjectName,
      m.score,
      m.maxMarks,
      `${m.percentage}%`,
      m.gradeLetter,
      m.passed ? 'Pass' : 'Fail',
      m.status,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `exam-results-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const reportCardMarks = useMemo(() => {
    if (!reportCardStudentId) return [];
    return marks.filter((m) => m.studentId === reportCardStudentId);
  }, [marks, reportCardStudentId]);

  const reportCardStudent = reportCardMarks[0] || null;
  const reportCardAverage =
    reportCardMarks.length > 0
      ? Math.round(
          (reportCardMarks.reduce((sum, m) => sum + m.percentage, 0) / reportCardMarks.length) * 10
        ) / 10
      : 0;

  const stats = overview?.telemetry?.summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('exams.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('exams.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={loadAllExamData} disabled={loading}>
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            <span>{t('common.refresh')}</span>
          </Button>
          {canManageSchedules && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setSessionModalOpen(true)}>
                <Plus className="w-3.5 h-3.5" />
                <span>{t('exams.createSession')}</span>
              </Button>
              <Button size="sm" onClick={openCreateScheduleModal}>
                <Plus className="w-3.5 h-3.5" />
                <span>{t('exams.createSchedule')}</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={cn(
            'px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5',
            activeTab === 'overview'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          )}
        >
          <BookOpenCheck className="w-3.5 h-3.5" />
          <span>{t('exams.tabOverview')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('timetable')}
          className={cn(
            'px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5',
            activeTab === 'timetable'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          )}
        >
          <CalendarClock className="w-3.5 h-3.5" />
          <span>{t('exams.tabTimetable')}</span>
        </button>

        {!isPortalRestricted && canManageSchedules && (
          <button
            type="button"
            onClick={() => setActiveTab('marks')}
            className={cn(
              'px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5',
              activeTab === 'marks'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            )}
          >
            <ClipboardEdit className="w-3.5 h-3.5" />
            <span>{t('exams.tabMarksEntry')}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('results')}
          className={cn(
            'px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5',
            activeTab === 'results'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          )}
        >
          <Award className="w-3.5 h-3.5" />
          <span>{t('exams.tabResults')}</span>
        </button>
      </div>

      {error && (
        <Card className="p-4 border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </Card>
      )}

      {feedback && (
        <Card className="p-4 border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </Card>
      )}

      {/* TAB 1: DASHBOARD & ANALYTICS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card className="p-5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('exams.kpiUpcoming')}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">{stats?.upcomingExams ?? 0}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  / {stats?.totalSchedules ?? 0} {t('exams.kpiTotalSchedules')}
                </span>
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('exams.kpiAverageScore')}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">{stats?.averageScore ?? 0}%</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {stats?.totalMarksRecorded ?? 0} {t('exams.colScore')}
                </span>
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('exams.kpiPassRate')}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {stats?.passRate ?? 0}%
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {stats?.publishedMarksCount ?? 0} {t('exams.kpiPublishedMarks')}
                </span>
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('exams.kpiPendingApproval')}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">{stats?.pendingApprovalCount ?? 0}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {overview?.sessions?.length ?? 0} {t('exams.sessionsTitle')}
                </span>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-5 lg:col-span-2">
              <div className="mb-4">
                <h2 className="text-sm font-semibold">{t('exams.subjectPerfTitle')}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('widgets.chartExamPerformanceDesc')}
                </p>
              </div>
              {overview?.telemetry?.subjectPerformance &&
              overview.telemetry.subjectPerformance.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={overview.telemetry.subjectPerformance}
                      margin={{ top: 8, right: 12, left: -16, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                      <XAxis dataKey="subject" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar
                        dataKey="averagePercentage"
                        name={t('exams.kpiAverageScore')}
                        fill={settings?.primaryColor || '#0F4C81'}
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="passRate"
                        name={t('exams.kpiPassRate')}
                        fill={settings?.accentColor || '#059669'}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-center text-xs text-slate-500 dark:text-slate-400 gap-2">
                  <FileSpreadsheet className="w-6 h-6 text-slate-400" />
                  <span>{t('exams.noResultsDesc')}</span>
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold">{t('exams.gradeDistTitle')}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('exams.tabResults')}
                </p>
              </div>
              {overview?.telemetry?.gradeDistribution &&
              overview.telemetry.gradeDistribution.some((g) => g.count > 0) ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={overview.telemetry.gradeDistribution}
                      margin={{ top: 8, right: 8, left: -20, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                      <XAxis dataKey="grade" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        fill={settings?.secondaryColor || '#1E3A5F'}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 text-center">
                  {t('common.noData')}
                </div>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold">{t('exams.upcomingTitle')}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('widgets.panelExamScheduleDesc')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab('timetable')}
                >
                  {t('exams.viewFullTimetable')}
                </Button>
              </div>

              {!overview?.telemetry?.upcomingSchedules ||
              overview.telemetry.upcomingSchedules.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <p className="text-sm font-medium">{t('exams.noSchedulesTitle')}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('exams.noSchedulesDesc')}
                  </p>
                  {canManageSchedules && (
                    <div className="pt-2">
                      <Button size="sm" onClick={openCreateScheduleModal}>
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t('exams.createSchedule')}</span>
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {overview.telemetry.upcomingSchedules.map((item) => (
                    <div
                      key={item.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.subjectName}
                          {item.subjectCode ? ` (${item.subjectCode})` : ''}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                          {item.examTitle} · {item.gradeLevel} · {item.room}
                          {item.invigilatorName ? ` · ${item.invigilatorName}` : ''}
                        </div>
                      </div>
                      <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300 sm:text-right shrink-0">
                        <div>{item.examDate}</div>
                        <div className="text-slate-500 dark:text-slate-400">
                          {item.startTime} – {item.endTime}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold">{t('exams.sessionsTitle')}</h2>
                {canManageSchedules && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSessionModalOpen(true)}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>

              {!overview?.sessions || overview.sessions.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                  {t('common.noData')}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {overview.sessions.map((ses: ExamSessionRecord) => (
                    <div key={ses.id} className="py-3 flex items-start justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{ses.title}</div>
                        <div className="text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                          {ses.term} · {ses.academicYear} · {ses.startDate} – {ses.endDate}
                        </div>
                      </div>
                      {canDeleteSchedules && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSession(ses.id)}
                          className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded cursor-pointer shrink-0"
                          aria-label={t('common.delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: EXAM TIMETABLE */}
      {activeTab === 'timetable' && (
        <Card className="p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[220px] flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={schSearch}
                  onChange={(e) => setSchSearch(e.target.value)}
                  placeholder={t('exams.searchSchedulesPlaceholder')}
                  className="pl-8"
                />
              </div>
              <Select value={schYear} onChange={(e) => setSchYear(e.target.value)} className="w-36">
                <option value="">{t('exams.allYears')}</option>
                {academicYearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
              <Select value={schGrade} onChange={(e) => setSchGrade(e.target.value)} className="w-36">
                <option value="">{t('exams.allGrades')}</option>
                {ALL_GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
              <Select value={schTerm} onChange={(e) => setSchTerm(e.target.value)} className="w-32">
                <option value="">{t('exams.allTerms')}</option>
                {EXAM_TERMS.map((tm) => (
                  <option key={tm} value={tm}>
                    {tm}
                  </option>
                ))}
              </Select>
              <Select value={schStatus} onChange={(e) => setSchStatus(e.target.value)} className="w-32">
                <option value="">{t('exams.allStatuses')}</option>
                <option value="scheduled">{t('exams.statusScheduled')}</option>
                <option value="completed">{t('exams.statusCompleted')}</option>
                <option value="cancelled">{t('exams.statusCancelled')}</option>
              </Select>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button variant="secondary" size="sm" onClick={exportTimetableCsv}>
                <Download className="w-3.5 h-3.5" />
                <span>{t('exams.exportCsv')}</span>
              </Button>
              {canManageSchedules && (
                <Button size="sm" onClick={openCreateScheduleModal}>
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('exams.createSchedule')}</span>
                </Button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pr-3 font-medium">{t('exams.colSubject')}</th>
                  <th className="py-2.5 pr-3 font-medium">{t('exams.colClass')}</th>
                  <th className="py-2.5 pr-3 font-medium">{t('exams.colDateRoom')}</th>
                  <th className="py-2.5 pr-3 font-medium">{t('exams.colInvigilator')}</th>
                  <th className="py-2.5 pr-3 font-medium">{t('exams.colProgress')}</th>
                  <th className="py-2.5 pr-3 font-medium">{t('exams.colWorkflowStatus')}</th>
                  <th className="py-2.5 font-medium text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSchedules.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500 dark:text-slate-400">
                      <div className="font-medium">{t('exams.noSchedulesTitle')}</div>
                      <div className="mt-1">{t('exams.noSchedulesDesc')}</div>
                    </td>
                  </tr>
                ) : (
                  filteredSchedules.map((sch) => (
                    <tr key={sch.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="py-3 pr-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {sch.subjectName}
                          {sch.subjectCode ? ` · ${sch.subjectCode}` : ''}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400">
                          {sch.examTitle} · {sch.term}
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <div className="font-medium">{sch.gradeLevel}</div>
                        <div className="text-slate-500 dark:text-slate-400">
                          {sch.division} · {sch.section === 'All' ? t('exams.allSections') : sch.section}
                        </div>
                      </td>
                      <td className="py-3 pr-3 font-mono tabular-nums">
                        <div>
                          {sch.examDate} · {sch.startTime}–{sch.endTime}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 font-sans">{sch.room}</div>
                      </td>
                      <td className="py-3 pr-3">
                        {sch.invigilatorName || (
                          <span className="text-slate-400">{t('exams.unassignedInvigilator')}</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 tabular-nums">
                        <div>
                          {sch.gradedCount ?? 0}/{sch.eligibleStudentsCount ?? 0}
                        </div>
                        {sch.averagePercentage !== null && sch.averagePercentage !== undefined && (
                          <div className="text-slate-500 dark:text-slate-400">
                            {t('exams.kpiAverageScore')}: {sch.averagePercentage}%
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={cn(
                            'font-medium capitalize',
                            sch.status === 'completed'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : sch.status === 'cancelled'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-sky-600 dark:text-sky-400'
                          )}
                        >
                          {sch.status === 'completed'
                            ? t('exams.statusCompleted')
                            : sch.status === 'cancelled'
                              ? t('exams.statusCancelled')
                              : t('exams.statusScheduled')}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {canManageSchedules && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setSelectedScheduleId(sch.id);
                                  setActiveTab('marks');
                                }}
                              >
                                {t('exams.enterMarksBtn')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEditScheduleModal(sch)}
                              >
                                {t('common.edit')}
                              </Button>
                            </>
                          )}
                          {canDeleteSchedules && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteSchedule(sch.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 3: MARKS ENTRY & PUBLISHING */}
      {activeTab === 'marks' && canManageSchedules && (
        <Card className="p-5 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="flex-1 max-w-xl">
              <Label>{t('exams.selectScheduleLabel')}</Label>
              <Select
                value={selectedScheduleId}
                onChange={(e) => setSelectedScheduleId(e.target.value)}
              >
                <option value="">{t('exams.selectScheduleLabel')}</option>
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.examDate} · {s.gradeLevel} ({s.section}) · {s.subjectName} — {s.examTitle}
                  </option>
                ))}
              </Select>
            </div>

            {rosterData && (
              <div className="text-xs text-slate-600 dark:text-slate-300 tabular-nums flex flex-wrap items-center gap-3">
                <span>
                  {t('exams.maxMarks')}: <strong>{rosterData.schedule.maxMarks}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {t('exams.passMarks')}: <strong>{rosterData.schedule.passMarks}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {rosterData.summary.enteredCount}/{rosterData.summary.totalStudents}{' '}
                  {t('exams.colProgress')}
                </span>
              </div>
            )}
          </div>

          {!selectedScheduleId ? (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              {t('exams.noScheduleSelected')}
            </div>
          ) : rosterLoading ? (
            <div className="py-10 text-center text-sm text-slate-500">{t('common.loading')}</div>
          ) : rosterData ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 pr-3 font-medium">{t('exams.colStudent')}</th>
                      <th className="py-2.5 pr-3 font-medium">{t('exams.colSitting')}</th>
                      <th className="py-2.5 pr-3 font-medium w-28">{t('exams.colScore')}</th>
                      <th className="py-2.5 pr-3 font-medium">{t('exams.colPercentage')}</th>
                      <th className="py-2.5 pr-3 font-medium">{t('exams.colGrade')}</th>
                      <th className="py-2.5 pr-3 font-medium">{t('exams.colOutcome')}</th>
                      <th className="py-2.5 pr-3 font-medium">{t('exams.colRemarks')}</th>
                      <th className="py-2.5 font-medium">{t('exams.colWorkflowStatus')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rosterData.roster.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-500">
                          {t('common.noData')}
                        </td>
                      </tr>
                    ) : (
                      rosterData.roster.map((item: ExamMarksRosterItem) => {
                        const d = draftMarks[item.student.id] || {
                          score: '',
                          attendanceStatus: 'sat' as ExamSittingStatus,
                          remarks: '',
                        };
                        const numericScore = d.attendanceStatus === 'sat' ? Number(d.score) : 0;
                        const hasScore =
                          d.attendanceStatus !== 'sat' || (d.score.trim() !== '' && !Number.isNaN(numericScore));
                        const pct = hasScore
                          ? Math.round((numericScore / rosterData.schedule.maxMarks) * 1000) / 10
                          : 0;
                        const passed =
                          hasScore &&
                          d.attendanceStatus === 'sat' &&
                          numericScore >= rosterData.schedule.passMarks;
                        const gradeLetter = hasScore
                          ? d.attendanceStatus === 'sat'
                            ? computeClientGradeLetter(pct)
                            : 'F'
                          : '—';

                        return (
                          <tr key={item.student.id}>
                            <td className="py-2.5 pr-3">
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {item.student.fullName}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                                {item.student.studentId} · {item.student.className}
                              </div>
                            </td>
                            <td className="py-2.5 pr-3">
                              <Select
                                value={d.attendanceStatus}
                                onChange={(e) =>
                                  setDraftMarks((prev) => ({
                                    ...prev,
                                    [item.student.id]: {
                                      ...d,
                                      attendanceStatus: e.target.value as ExamSittingStatus,
                                      score: e.target.value === 'sat' ? d.score : '0',
                                    },
                                  }))
                                }
                                className="h-8 text-xs w-28"
                              >
                                <option value="sat">{t('exams.sittingSat')}</option>
                                <option value="absent">{t('exams.sittingAbsent')}</option>
                                <option value="excused">{t('exams.sittingExcused')}</option>
                              </Select>
                            </td>
                            <td className="py-2.5 pr-3">
                              <Input
                                type="number"
                                min={0}
                                max={rosterData.schedule.maxMarks}
                                step="0.5"
                                disabled={d.attendanceStatus !== 'sat'}
                                value={d.score}
                                onChange={(e) =>
                                  setDraftMarks((prev) => ({
                                    ...prev,
                                    [item.student.id]: { ...d, score: e.target.value },
                                  }))
                                }
                                className="h-8 text-xs font-mono tabular-nums w-24"
                              />
                            </td>
                            <td className="py-2.5 pr-3 font-mono tabular-nums">
                              {hasScore ? `${pct}%` : '—'}
                            </td>
                            <td className="py-2.5 pr-3 font-semibold">{gradeLetter}</td>
                            <td className="py-2.5 pr-3">
                              {hasScore ? (
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1 font-medium',
                                    passed
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-red-600 dark:text-red-400'
                                  )}
                                >
                                  {passed ? (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  ) : (
                                    <XCircle className="w-3.5 h-3.5" />
                                  )}
                                  <span>{passed ? t('exams.passedLabel') : t('exams.failedLabel')}</span>
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-2.5 pr-3">
                              <Input
                                value={d.remarks}
                                onChange={(e) =>
                                  setDraftMarks((prev) => ({
                                    ...prev,
                                    [item.student.id]: { ...d, remarks: e.target.value },
                                  }))
                                }
                                placeholder={t('exams.remarksPlaceholder')}
                                className="h-8 text-xs min-w-[160px]"
                              />
                            </td>
                            <td className="py-2.5 capitalize text-slate-600 dark:text-slate-300">
                              {item.mark ? item.mark.status : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {canApprovePublish ? (
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncPromotionOnPublish}
                      onChange={(e) => setSyncPromotionOnPublish(e.target.checked)}
                    />
                    <span>{t('exams.syncPromotionLabel')}</span>
                  </label>
                ) : (
                  <div />
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSaveMarks('draft')}
                    disabled={savingMarks || publishingMarks}
                  >
                    {t('exams.saveDraftBtn')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSaveMarks('submitted')}
                    disabled={savingMarks || publishingMarks}
                  >
                    {t('exams.submitMarksBtn')}
                  </Button>
                  {canApprovePublish && rosterData.summary.enteredCount > 0 && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handlePublishAction('publish')}
                        disabled={savingMarks || publishingMarks}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{t('exams.approvePublishBtn')}</span>
                      </Button>
                      {rosterData.summary.publishedCount > 0 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handlePublishAction('return_draft')}
                          disabled={savingMarks || publishingMarks}
                        >
                          {t('exams.returnDraftBtn')}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </Card>
      )}

      {/* TAB 4: STUDENT RESULTS & REPORT CARDS */}
      {activeTab === 'results' && (
        <Card className="p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[220px] flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={resSearch}
                  onChange={(e) => setResSearch(e.target.value)}
                  placeholder={t('exams.searchResultsPlaceholder')}
                  className="pl-8"
                />
              </div>
              <Select value={resYear} onChange={(e) => setResYear(e.target.value)} className="w-36">
                <option value="">{t('exams.allYears')}</option>
                {academicYearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
              <Select value={resGrade} onChange={(e) => setResGrade(e.target.value)} className="w-36">
                <option value="">{t('exams.allGrades')}</option>
                {ALL_GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
              <Select value={resTerm} onChange={(e) => setResTerm(e.target.value)} className="w-32">
                <option value="">{t('exams.allTerms')}</option>
                {EXAM_TERMS.map((tm) => (
                  <option key={tm} value={tm}>
                    {tm}
                  </option>
                ))}
              </Select>
              {!isPortalRestricted && (
                <Select
                  value={resStatus}
                  onChange={(e) => setResStatus(e.target.value)}
                  className="w-32"
                >
                  <option value="">{t('exams.allStatuses')}</option>
                  <option value="draft">{t('exams.statusDraft')}</option>
                  <option value="submitted">{t('exams.statusSubmitted')}</option>
                  <option value="approved">{t('exams.statusApproved')}</option>
                  <option value="published">{t('exams.statusPublished')}</option>
                </Select>
              )}
            </div>

            <Button variant="secondary" size="sm" onClick={exportResultsCsv}>
              <Download className="w-3.5 h-3.5" />
              <span>{t('exams.exportCsv')}</span>
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pr-3 font-medium">{t('exams.colStudent')}</th>
                  <th className="py-2.5 pr-3 font-medium">{t('exams.colSubject')}</th>
                  <th className="py-2.5 pr-3 font-medium">{t('exams.examTitleLabel')}</th>
                  <th className="py-2.5 pr-3 font-medium">{t('exams.colScore')}</th>
                  <th className="py-2.5 pr-3 font-medium">{t('exams.colGrade')}</th>
                  <th className="py-2.5 pr-3 font-medium">{t('exams.colOutcome')}</th>
                  <th className="py-2.5 pr-3 font-medium">{t('exams.colWorkflowStatus')}</th>
                  <th className="py-2.5 font-medium text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredMarks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500 dark:text-slate-400">
                      <div className="font-medium">{t('exams.noResultsTitle')}</div>
                      <div className="mt-1">{t('exams.noResultsDesc')}</div>
                    </td>
                  </tr>
                ) : (
                  filteredMarks.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="py-3 pr-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {m.studentName}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          {m.studentCode} · {m.gradeLevel} - {m.section}
                        </div>
                      </td>
                      <td className="py-3 pr-3 font-medium">{m.subjectName}</td>
                      <td className="py-3 pr-3 text-slate-500 dark:text-slate-400">
                        {m.examTitle} · {m.term}
                      </td>
                      <td className="py-3 pr-3 font-mono tabular-nums">
                        {m.score}/{m.maxMarks} ({m.percentage}%)
                      </td>
                      <td className="py-3 pr-3 font-bold">{m.gradeLetter}</td>
                      <td className="py-3 pr-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 font-medium',
                            m.passed && m.attendanceStatus === 'sat'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          )}
                        >
                          {m.passed && m.attendanceStatus === 'sat' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {m.passed && m.attendanceStatus === 'sat'
                              ? t('exams.passedLabel')
                              : t('exams.failedLabel')}
                          </span>
                        </span>
                      </td>
                      <td className="py-3 pr-3 capitalize">{m.status}</td>
                      <td className="py-3 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setReportCardStudentId(m.studentId)}
                        >
                          <GraduationCap className="w-3.5 h-3.5" />
                          <span>{t('exams.reportCardBtn')}</span>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* SCHEDULE CREATE / EDIT MODAL */}
      <Modal
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        title={editingScheduleId ? t('exams.editSchedule') : t('exams.createSchedule')}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveSchedule} className="space-y-4">
          {scheduleFormError && (
            <div className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              {scheduleFormError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>{t('exams.sessionsTitle')}</Label>
              <Select
                value={schForm.examSessionId}
                onChange={(e) => {
                  const ses = overview?.sessions.find((s) => s.id === e.target.value);
                  setSchForm((prev) => ({
                    ...prev,
                    examSessionId: e.target.value,
                    examTitle: ses ? ses.title : prev.examTitle,
                    academicYear: ses ? ses.academicYear : prev.academicYear,
                    term: ses ? ses.term : prev.term,
                  }));
                }}
              >
                <option value="">{t('common.none')}</option>
                {(overview?.sessions || []).map((ses) => (
                  <option key={ses.id} value={ses.id}>
                    {ses.title} ({ses.academicYear})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>{t('exams.examTitleLabel')}</Label>
              <Input
                value={schForm.examTitle}
                onChange={(e) => setSchForm({ ...schForm, examTitle: e.target.value })}
                required
              />
            </div>

            <div>
              <Label>{t('exams.academicYear')}</Label>
              <Input
                value={schForm.academicYear}
                onChange={(e) => setSchForm({ ...schForm, academicYear: e.target.value })}
                placeholder="2026-2027"
                required
              />
            </div>

            <div>
              <Label>{t('exams.termLabel')}</Label>
              <Select
                value={schForm.term}
                onChange={(e) => setSchForm({ ...schForm, term: e.target.value as ExamTerm })}
              >
                {EXAM_TERMS.map((tm) => (
                  <option key={tm} value={tm}>
                    {tm}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>{t('exams.divisionLabel')}</Label>
              <Select
                value={schForm.division}
                onChange={(e) => {
                  const div = e.target.value as 'Primary' | 'Secondary';
                  setSchForm({
                    ...schForm,
                    division: div,
                    gradeLevel: div === 'Primary' ? 'Grade 1' : 'Form 1',
                  });
                }}
              >
                <option value="Primary">{t('students.primaryDivision')}</option>
                <option value="Secondary">{t('students.secondaryDivision')}</option>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t('exams.gradeLabel')}</Label>
                <Select
                  value={schForm.gradeLevel}
                  onChange={(e) => setSchForm({ ...schForm, gradeLevel: e.target.value })}
                >
                  {(schForm.division === 'Primary'
                    ? GRADE_OPTIONS_PRIMARY
                    : GRADE_OPTIONS_SECONDARY
                  ).map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{t('exams.sectionLabel')}</Label>
                <Input
                  value={schForm.section}
                  onChange={(e) => setSchForm({ ...schForm, section: e.target.value })}
                  placeholder="All"
                />
              </div>
            </div>

            <div>
              <Label>{t('exams.subjectName')}</Label>
              <Input
                value={schForm.subjectName}
                onChange={(e) => setSchForm({ ...schForm, subjectName: e.target.value })}
                placeholder="Mathematics"
                required
              />
            </div>

            <div>
              <Label>{t('exams.subjectCode')}</Label>
              <Input
                value={schForm.subjectCode}
                onChange={(e) => setSchForm({ ...schForm, subjectCode: e.target.value })}
                placeholder="MATH-101"
              />
            </div>

            <div>
              <Label>{t('exams.examDate')}</Label>
              <Input
                type="date"
                value={schForm.examDate}
                onChange={(e) => setSchForm({ ...schForm, examDate: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t('exams.startTime')}</Label>
                <Input
                  type="time"
                  value={schForm.startTime}
                  onChange={(e) => setSchForm({ ...schForm, startTime: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>{t('exams.endTime')}</Label>
                <Input
                  type="time"
                  value={schForm.endTime}
                  onChange={(e) => setSchForm({ ...schForm, endTime: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <Label>{t('exams.roomLabel')}</Label>
              <Input
                value={schForm.room}
                onChange={(e) => setSchForm({ ...schForm, room: e.target.value })}
                required
              />
            </div>

            <div>
              <Label>{t('exams.invigilatorLabel')}</Label>
              <Select
                value={schForm.invigilatorId}
                onChange={(e) => setSchForm({ ...schForm, invigilatorId: e.target.value })}
              >
                <option value="">{t('exams.unassignedInvigilator')}</option>
                {(overview?.invigilators || []).map((inv: ExamInvigilatorOption) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.fullName} ({inv.roleName})
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t('exams.maxMarks')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={schForm.maxMarks}
                  onChange={(e) => setSchForm({ ...schForm, maxMarks: Number(e.target.value) })}
                  required
                />
              </div>
              <div>
                <Label>{t('exams.passMarks')}</Label>
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  value={schForm.passMarks}
                  onChange={(e) => setSchForm({ ...schForm, passMarks: Number(e.target.value) })}
                  required
                />
              </div>
            </div>

            <div>
              <Label>{t('exams.colWorkflowStatus')}</Label>
              <Select
                value={schForm.status}
                onChange={(e) =>
                  setSchForm({ ...schForm, status: e.target.value as ExamScheduleStatus })
                }
              >
                <option value="scheduled">{t('exams.statusScheduled')}</option>
                <option value="completed">{t('exams.statusCompleted')}</option>
                <option value="cancelled">{t('exams.statusCancelled')}</option>
              </Select>
            </div>
          </div>

          <div>
            <Label>{t('exams.notesLabel')}</Label>
            <Input
              value={schForm.notes}
              onChange={(e) => setSchForm({ ...schForm, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setScheduleModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={savingSchedule}>
              {savingSchedule ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* SESSION CREATE MODAL */}
      <Modal
        open={sessionModalOpen}
        onClose={() => setSessionModalOpen(false)}
        title={t('exams.createSession')}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSaveSession} className="space-y-4">
          {sessionError && (
            <div className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              {sessionError}
            </div>
          )}
          <div>
            <Label>{t('exams.sessionTitleLabel')}</Label>
            <Input
              value={sessionForm.title}
              onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('exams.academicYear')}</Label>
              <Input
                value={sessionForm.academicYear}
                onChange={(e) => setSessionForm({ ...sessionForm, academicYear: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>{t('exams.termLabel')}</Label>
              <Select
                value={sessionForm.term}
                onChange={(e) => setSessionForm({ ...sessionForm, term: e.target.value as ExamTerm })}
              >
                {EXAM_TERMS.map((tm) => (
                  <option key={tm} value={tm}>
                    {tm}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t('exams.sessionStart')}</Label>
              <Input
                type="date"
                value={sessionForm.startDate}
                onChange={(e) => setSessionForm({ ...sessionForm, startDate: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>{t('exams.sessionEnd')}</Label>
              <Input
                type="date"
                value={sessionForm.endDate}
                onChange={(e) => setSessionForm({ ...sessionForm, endDate: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <Label>{t('exams.notesLabel')}</Label>
            <Input
              value={sessionForm.description}
              onChange={(e) => setSessionForm({ ...sessionForm, description: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSessionModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={savingSession}>
              {savingSession ? t('common.saving') : t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* STUDENT REPORT CARD MODAL */}
      <Modal
        open={Boolean(reportCardStudentId)}
        onClose={() => setReportCardStudentId(null)}
        title={t('exams.reportCardTitle')}
        maxWidth="max-w-2xl"
      >
        {reportCardStudent && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {settings?.schoolName}
                </div>
                <h3 className="text-lg font-bold mt-0.5">{reportCardStudent.studentName}</h3>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                  {reportCardStudent.studentCode} · {reportCardStudent.gradeLevel} -{' '}
                  {reportCardStudent.section} · {reportCardStudent.academicYear}
                </div>
              </div>

              <div className="sm:text-right">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {t('exams.overallAverage')}
                </div>
                <div className="text-2xl font-bold tabular-nums">
                  {reportCardAverage}% ({computeClientGradeLetter(reportCardAverage)})
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {t('exams.subjectsPassed')}:{' '}
                  {reportCardMarks.filter((m) => m.passed && m.attendanceStatus === 'sat').length}/
                  {reportCardMarks.length}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-3 font-medium">{t('exams.colSubject')}</th>
                    <th className="py-2 pr-3 font-medium">{t('exams.termLabel')}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t('exams.colScore')}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t('exams.colPercentage')}</th>
                    <th className="py-2 pr-3 font-medium">{t('exams.colGrade')}</th>
                    <th className="py-2 font-medium">{t('exams.colOutcome')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {reportCardMarks.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 pr-3 font-medium">{m.subjectName}</td>
                      <td className="py-2.5 pr-3 text-slate-500 dark:text-slate-400">{m.term}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                        {m.score}/{m.maxMarks}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                        {m.percentage}%
                      </td>
                      <td className="py-2.5 pr-3 font-bold">{m.gradeLetter}</td>
                      <td className="py-2.5">
                        <span
                          className={cn(
                            'font-medium',
                            m.passed && m.attendanceStatus === 'sat'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          )}
                        >
                          {m.passed && m.attendanceStatus === 'sat'
                            ? t('exams.passedLabel')
                            : t('exams.failedLabel')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2 print:hidden">
              <Button variant="secondary" onClick={() => setReportCardStudentId(null)}>
                {t('common.close')}
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="w-3.5 h-3.5" />
                <span>{t('exams.printReport')}</span>
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
