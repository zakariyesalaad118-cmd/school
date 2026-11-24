import {
  AlertCircle,
  AlertTriangle,
  BellRing,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  FileCheck2,
  Phone,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  UserCog,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AbsenceFollowUpModal } from '../components/attendance/AbsenceFollowUpModal';
import { ALL_GRADES, SECTIONS } from '../components/students/StudentFormModal';
import { Button, Card, Input, Select } from '../components/ui/Primitives';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest, resolveAssetUrl } from '../services/api';
import type {
  AbsenceWarning,
  AbsenceWarningsResponse,
  AbsenceWarningStatus,
  AttendanceListResponse,
  AttendanceSession,
  AttendanceStatus,
  BulkAttendanceSaveResponse,
  RollCallResponse,
  RollCallRosterItem,
  TeacherBulkAttendanceSaveResponse,
  TeacherRollCallResponse,
  TeacherRollCallRosterItem,
} from '../types/nexus';
import { cn } from '../utils/cn';

const TODAY_ISO = new Date().toISOString().slice(0, 10);

type AttendanceTab = 'rollcall' | 'teachers' | 'warnings' | 'logbook';

interface DraftRollEntry {
  status: AttendanceStatus | null;
  notes: string;
}

export function AttendancePage() {
  const { t } = useTranslation();
  const { can, role, user } = useAuth();

  const isStudentOrParent = role?.slug === 'student' || role?.slug === 'parent';
  const canTakeRollCall =
    !isStudentOrParent &&
    (can('attendance', 'create') || can('attendance', 'edit') || can('attendance', 'manage'));
  const canManageTeachers =
    !isStudentOrParent &&
    role?.slug !== 'teacher' &&
    (Boolean(user?.isSuperAdmin) ||
      Boolean(role?.isSuperAdminRole) ||
      can('attendance', 'manage') ||
      can('teachers', 'manage') ||
      can('hr', 'manage') ||
      can('attendance', 'create') ||
      can('attendance', 'edit'));
  const canViewWarnings = !isStudentOrParent;
  const canDelete = can('attendance', 'delete');

  const [activeTab, setActiveTab] = useState<AttendanceTab>(
    canTakeRollCall ? 'rollcall' : 'logbook'
  );

  // Shared Date & Session Context
  const [selectedDate, setSelectedDate] = useState(TODAY_ISO);
  const [selectedSession, setSelectedSession] = useState<AttendanceSession>('Morning');

  // Student Roll Call State
  const [rollGradeFilter, setRollGradeFilter] = useState('');
  const [rollSectionFilter, setRollSectionFilter] = useState('');
  const [rollSearch, setRollSearch] = useState('');
  const [roster, setRoster] = useState<RollCallRosterItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftRollEntry>>({});
  const [loadingRollCall, setLoadingRollCall] = useState(canTakeRollCall);
  const [savingRollCall, setSavingRollCall] = useState(false);
  const [rollFeedback, setRollFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    newlyTriggeredCount?: number;
  } | null>(null);

  // Teacher Roll Call State
  const [teacherSearch, setTeacherSearch] = useState('');
  const [includeAllStaff, setIncludeAllStaff] = useState(false);
  const [teacherRoster, setTeacherRoster] = useState<TeacherRollCallRosterItem[]>([]);
  const [teacherDrafts, setTeacherDrafts] = useState<Record<string, DraftRollEntry>>({});
  const [loadingTeacherRollCall, setLoadingTeacherRollCall] = useState(false);
  const [savingTeacherRollCall, setSavingTeacherRollCall] = useState(false);
  const [teacherFeedback, setTeacherFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    newlyTriggeredCount?: number;
  } | null>(null);

  // Absence Warnings State
  const [warningsData, setWarningsData] = useState<AbsenceWarningsResponse | null>(null);
  const [loadingWarnings, setLoadingWarnings] = useState(false);
  const [scanningWarnings, setScanningWarnings] = useState(false);
  const [warningSubjectFilter, setWarningSubjectFilter] = useState('');
  const [warningStatusFilter, setWarningStatusFilter] = useState('active');
  const [warningSearch, setWarningSearch] = useState('');
  const [warningFeedback, setWarningFeedback] = useState<string | null>(null);
  const [followUpTarget, setFollowUpTarget] = useState<AbsenceWarning | null>(null);

  // Logbook State
  const [attendanceData, setAttendanceData] = useState<AttendanceListResponse | null>(null);
  const [loadingLog, setLoadingLog] = useState(true);
  const [logError, setLogError] = useState<string | null>(null);
  const [logSearch, setLogSearch] = useState('');
  const [logGradeFilter, setLogGradeFilter] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState('');
  const [logSessionFilter, setLogSessionFilter] = useState('');

  const loadAttendanceLog = async () => {
    setLoadingLog(true);
    setLogError(null);
    try {
      const params = new URLSearchParams();
      if (selectedDate) params.set('date', selectedDate);
      if (logGradeFilter) params.set('gradeLevel', logGradeFilter);
      if (logStatusFilter) params.set('status', logStatusFilter);
      if (logSessionFilter) params.set('session', logSessionFilter);
      if (logSearch.trim()) params.set('search', logSearch.trim());

      const res = await apiRequest<AttendanceListResponse>(
        `/api/attendance?${params.toString()}`
      );
      setAttendanceData(res);
    } catch (err) {
      setLogError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setLoadingLog(false);
    }
  };

  const loadWarnings = async () => {
    if (!canViewWarnings) return;
    setLoadingWarnings(true);
    try {
      const params = new URLSearchParams();
      if (warningStatusFilter) params.set('status', warningStatusFilter);
      if (warningSubjectFilter) params.set('subjectType', warningSubjectFilter);
      if (warningSearch.trim()) params.set('search', warningSearch.trim());

      const res = await apiRequest<AbsenceWarningsResponse>(
        `/api/attendance/warnings?${params.toString()}`
      );
      setWarningsData(res);
    } catch {
      // keep silent in background badge load
    } finally {
      setLoadingWarnings(false);
    }
  };

  const loadRollCall = async (preserveFeedback = false) => {
    if (!canTakeRollCall) return;
    setLoadingRollCall(true);
    if (!preserveFeedback) {
      setRollFeedback(null);
    }
    try {
      const params = new URLSearchParams();
      params.set('date', selectedDate || TODAY_ISO);
      params.set('session', selectedSession);
      if (rollGradeFilter) params.set('gradeLevel', rollGradeFilter);
      if (rollSectionFilter) params.set('section', rollSectionFilter);
      if (rollSearch.trim()) params.set('search', rollSearch.trim());

      const res = await apiRequest<RollCallResponse>(
        `/api/attendance/roll-call?${params.toString()}`
      );
      setRoster(res.roster || []);
      const nextDrafts: Record<string, DraftRollEntry> = {};
      for (const item of res.roster || []) {
        nextDrafts[item.student.id] = {
          status: item.currentStatus,
          notes: item.notes || '',
        };
      }
      setDrafts(nextDrafts);
    } catch (err) {
      setRollFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : t('common.errorGeneric'),
      });
    } finally {
      setLoadingRollCall(false);
    }
  };

  const loadTeacherRollCall = async (preserveFeedback = false) => {
    if (!canManageTeachers) return;
    setLoadingTeacherRollCall(true);
    if (!preserveFeedback) {
      setTeacherFeedback(null);
    }
    try {
      const params = new URLSearchParams();
      params.set('date', selectedDate || TODAY_ISO);
      params.set('session', selectedSession);
      if (teacherSearch.trim()) params.set('search', teacherSearch.trim());
      if (includeAllStaff) params.set('includeAllStaff', 'true');

      const res = await apiRequest<TeacherRollCallResponse>(
        `/api/attendance/teachers/roll-call?${params.toString()}`
      );
      setTeacherRoster(res.roster || []);
      const nextDrafts: Record<string, DraftRollEntry> = {};
      for (const item of res.roster || []) {
        nextDrafts[item.teacher.id] = {
          status: item.currentStatus,
          notes: item.notes || '',
        };
      }
      setTeacherDrafts(nextDrafts);
    } catch (err) {
      setTeacherFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : t('common.errorGeneric'),
      });
    } finally {
      setLoadingTeacherRollCall(false);
    }
  };

  useEffect(() => {
    loadAttendanceLog();
  }, [selectedDate, logGradeFilter, logStatusFilter, logSessionFilter, logSearch]);

  useEffect(() => {
    if (canTakeRollCall) {
      loadRollCall();
    }
  }, [canTakeRollCall, selectedDate, selectedSession, rollGradeFilter, rollSectionFilter, rollSearch]);

  useEffect(() => {
    if (canManageTeachers) {
      loadTeacherRollCall();
    }
  }, [canManageTeachers, selectedDate, selectedSession, teacherSearch, includeAllStaff]);

  useEffect(() => {
    if (canViewWarnings) {
      loadWarnings();
    }
  }, [canViewWarnings, warningStatusFilter, warningSubjectFilter, warningSearch]);

  // Student roll call draft helpers
  const updateRowStatus = (studentId: string, status: AttendanceStatus) => {
    setRollFeedback(null);
    setDrafts((prev) => ({
      ...prev,
      [studentId]: { status, notes: prev[studentId]?.notes ?? '' },
    }));
  };

  const updateRowNotes = (studentId: string, notes: string) => {
    setRollFeedback(null);
    setDrafts((prev) => ({
      ...prev,
      [studentId]: { status: prev[studentId]?.status ?? null, notes },
    }));
  };

  const markAllDisplayed = (status: AttendanceStatus) => {
    setRollFeedback(null);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const item of roster) {
        next[item.student.id] = {
          status,
          notes: prev[item.student.id]?.notes ?? item.notes ?? '',
        };
      }
      return next;
    });
  };

  // Teacher roll call draft helpers
  const updateTeacherStatus = (teacherId: string, status: AttendanceStatus) => {
    setTeacherFeedback(null);
    setTeacherDrafts((prev) => ({
      ...prev,
      [teacherId]: { status, notes: prev[teacherId]?.notes ?? '' },
    }));
  };

  const updateTeacherNotes = (teacherId: string, notes: string) => {
    setTeacherFeedback(null);
    setTeacherDrafts((prev) => ({
      ...prev,
      [teacherId]: { status: prev[teacherId]?.status ?? null, notes },
    }));
  };

  const markAllTeachersDisplayed = (status: AttendanceStatus) => {
    setTeacherFeedback(null);
    setTeacherDrafts((prev) => {
      const next = { ...prev };
      for (const item of teacherRoster) {
        next[item.teacher.id] = {
          status,
          notes: prev[item.teacher.id]?.notes ?? item.notes ?? '',
        };
      }
      return next;
    });
  };

  const { dirtyCount, markedEntries } = useMemo(() => {
    let dirty = 0;
    const entries: Array<{ studentId: string; status: AttendanceStatus; notes: string }> = [];

    for (const item of roster) {
      const draft = drafts[item.student.id];
      const draftStatus = draft?.status ?? null;
      const draftNotes = (draft?.notes ?? '').trim();
      const origNotes = (item.notes || '').trim();

      if (draftStatus !== item.currentStatus || (draftStatus !== null && draftNotes !== origNotes)) {
        dirty += 1;
      }
      if (draftStatus !== null) {
        entries.push({ studentId: item.student.id, status: draftStatus, notes: draftNotes });
      }
    }

    return { dirtyCount: dirty, markedEntries: entries };
  }, [roster, drafts]);

  const { teacherDirtyCount, markedTeacherEntries } = useMemo(() => {
    let dirty = 0;
    const entries: Array<{ teacherId: string; status: AttendanceStatus; notes: string }> = [];

    for (const item of teacherRoster) {
      const draft = teacherDrafts[item.teacher.id];
      const draftStatus = draft?.status ?? null;
      const draftNotes = (draft?.notes ?? '').trim();
      const origNotes = (item.notes || '').trim();

      if (draftStatus !== item.currentStatus || (draftStatus !== null && draftNotes !== origNotes)) {
        dirty += 1;
      }
      if (draftStatus !== null) {
        entries.push({ teacherId: item.teacher.id, status: draftStatus, notes: draftNotes });
      }
    }

    return { teacherDirtyCount: dirty, markedTeacherEntries: entries };
  }, [teacherRoster, teacherDrafts]);

  const handleSaveRollCall = async () => {
    if (markedEntries.length === 0) return;
    setSavingRollCall(true);
    setRollFeedback(null);
    try {
      const res = await apiRequest<BulkAttendanceSaveResponse>('/api/attendance/bulk', {
        method: 'POST',
        body: JSON.stringify({
          date: selectedDate || TODAY_ISO,
          session: selectedSession,
          entries: markedEntries,
        }),
      });

      setRollFeedback({
        type: 'success',
        message: t('attendance.rollCallSavedSummary', {
          date: res.date,
          session: res.session,
          present: res.summary.present,
          absent: res.summary.absent,
          late: res.summary.late,
          excused: res.summary.excused,
        }),
        newlyTriggeredCount: res.triggeredWarnings?.length || 0,
      });
      await Promise.all([loadRollCall(true), loadAttendanceLog(), loadWarnings()]);
    } catch (err) {
      setRollFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : t('common.errorGeneric'),
      });
    } finally {
      setSavingRollCall(false);
    }
  };

  const handleSaveTeacherRollCall = async () => {
    if (markedTeacherEntries.length === 0) return;
    setSavingTeacherRollCall(true);
    setTeacherFeedback(null);
    try {
      const res = await apiRequest<TeacherBulkAttendanceSaveResponse>(
        '/api/attendance/teachers/bulk',
        {
          method: 'POST',
          body: JSON.stringify({
            date: selectedDate || TODAY_ISO,
            session: selectedSession,
            entries: markedTeacherEntries,
          }),
        }
      );

      setTeacherFeedback({
        type: 'success',
        message: t('attendance.teacherRollCallSavedSummary', {
          date: res.date,
          session: res.session,
          present: res.summary.present,
          absent: res.summary.absent,
          late: res.summary.late,
          excused: res.summary.excused,
        }),
        newlyTriggeredCount: res.triggeredWarnings?.length || 0,
      });
      await Promise.all([loadTeacherRollCall(true), loadWarnings()]);
    } catch (err) {
      setTeacherFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : t('common.errorGeneric'),
      });
    } finally {
      setSavingTeacherRollCall(false);
    }
  };

  const handleScanWarnings = async () => {
    setScanningWarnings(true);
    setWarningFeedback(null);
    try {
      const res = await apiRequest<{
        newlyTriggeredCount: number;
        autoResolvedCount: number;
      }>('/api/attendance/warnings/scan', { method: 'POST' });
      setWarningFeedback(
        t('attendance.scanCompleteMsg', {
          triggered: res.newlyTriggeredCount,
          resolved: res.autoResolvedCount,
        })
      );
      await loadWarnings();
    } catch (err) {
      setWarningFeedback(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setScanningWarnings(false);
    }
  };

  const handleDeleteLog = async (id: string) => {
    try {
      await apiRequest(`/api/attendance/${id}`, { method: 'DELETE' });
      await Promise.all([
        loadAttendanceLog(),
        canTakeRollCall ? loadRollCall() : Promise.resolve(),
        loadWarnings(),
      ]);
    } catch (err) {
      setLogError(err instanceof Error ? err.message : t('common.errorGeneric'));
    }
  };

  const exportCsv = () => {
    if (!attendanceData?.records.length) return;
    const headers = [
      'Date',
      'Time Recorded',
      'Student ID',
      'Student Name',
      'Class',
      'Session',
      'Status',
      'Entry Type',
      'Recorded By',
      'Notes',
    ];
    const rows = attendanceData.records.map((r) =>
      [
        r.date,
        new Date(r.checkInTime).toLocaleTimeString(),
        r.studentCode,
        r.studentName,
        r.className,
        r.session,
        r.status,
        r.method,
        r.recordedBy,
        r.notes,
      ]
        .map((v) => `"${String(v || '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance-${selectedDate || 'all'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusLabel = (status: AttendanceStatus) => {
    switch (status) {
      case 'present':
        return t('attendance.statusPresent');
      case 'late':
        return t('attendance.statusLate');
      case 'absent':
        return t('attendance.statusAbsent');
      case 'excused':
        return t('attendance.statusExcused');
    }
  };

  const getStatusColor = (status: AttendanceStatus) => {
    switch (status) {
      case 'present':
        return 'text-emerald-700 dark:text-emerald-400';
      case 'late':
        return 'text-amber-700 dark:text-amber-400';
      case 'absent':
        return 'text-red-700 dark:text-red-400';
      case 'excused':
        return 'text-sky-700 dark:text-sky-400';
    }
  };

  const getWarningStatusLabel = (st: AbsenceWarningStatus) => {
    switch (st) {
      case 'open':
        return t('attendance.statusOpen');
      case 'acknowledged':
        return t('attendance.statusAcknowledged');
      case 'in_progress':
        return t('attendance.statusInProgress');
      case 'resolved':
        return t('attendance.statusResolved');
      case 'dismissed':
        return t('attendance.statusDismissed');
    }
  };

  const getWarningStatusColor = (st: AbsenceWarningStatus) => {
    switch (st) {
      case 'open':
        return 'text-red-700 dark:text-red-400';
      case 'in_progress':
        return 'text-amber-700 dark:text-amber-400';
      case 'acknowledged':
        return 'text-sky-700 dark:text-sky-400';
      case 'resolved':
      case 'dismissed':
        return 'text-emerald-700 dark:text-emerald-400';
    }
  };

  const getMethodLabel = (method: string) => {
    if (method === 'teacher_rollcall') return t('attendance.methodRollCall');
    if (method === 'manual') return t('attendance.methodManual');
    return t('attendance.methodQr');
  };

  const summary = attendanceData?.summary;
  const records = attendanceData?.records || [];
  const warnings = warningsData?.warnings || [];
  const warningsSummary = warningsData?.summary;
  const activeAlertsCount =
    (warningsSummary?.open ?? 0) +
    (warningsSummary?.acknowledged ?? 0) +
    (warningsSummary?.inProgress ?? 0);

  return (
    <div className="space-y-6">
      {/* Page Header & Global Date/Session Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('attendance.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('attendance.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40 font-mono tabular-nums"
            aria-label={t('attendance.attendanceDate')}
          />
          <Select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value as AttendanceSession)}
            className="w-36"
            aria-label={t('attendance.sessionLabel')}
          >
            <option value="Morning">{t('attendance.sessionMorning')}</option>
            <option value="Afternoon">{t('attendance.sessionAfternoon')}</option>
            <option value="Full Day">{t('attendance.sessionFullDay')}</option>
          </Select>
        </div>
      </div>

      {/* Attendance Officer Active Consecutive Absence Alert Banner */}
      {canViewWarnings && activeAlertsCount > 0 && activeTab !== 'warnings' && (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-amber-300 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-start gap-3">
            <BellRing className="w-5 h-5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
            <div>
              <div className="text-sm font-semibold tabular-nums">
                {t('attendance.warningsBannerTitle', { count: activeAlertsCount })}
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                {t('attendance.warningsBannerDesc')}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setActiveTab('warnings')}
            className="shrink-0"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
            <span>{t('attendance.viewWarningsBtn')}</span>
          </Button>
        </div>
      )}

      {/* Summary KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{t('attendance.kpiPresent')}</span>
            <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {summary?.present ?? 0}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
              {t('attendance.kpiRateLabel', { rate: summary?.attendanceRate ?? 0 })}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{t('attendance.kpiAbsent')}</span>
            <UserX className="w-4 h-4 text-red-600 dark:text-red-400" />
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold tabular-nums text-red-700 dark:text-red-400">
              {summary?.absent ?? 0}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
              {selectedDate}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{t('attendance.kpiLateExcused')}</span>
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {(summary?.late ?? 0) + (summary?.excused ?? 0)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
              {t('attendance.statusLate')}: {summary?.late ?? 0} ·{' '}
              {t('attendance.statusExcused')}: {summary?.excused ?? 0}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{t('attendance.kpiMarkedProgress')}</span>
            <Users className="w-4 h-4 text-sky-700 dark:text-sky-400" />
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {summary?.markedStudents ?? summary?.totalLogged ?? 0}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
              {t('attendance.kpiRosterCoverage', { total: summary?.totalActiveStudents ?? 0 })}
            </div>
          </div>
        </Card>
      </div>

      {/* Segmented Workspace Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
          {canTakeRollCall && (
            <button
              type="button"
              onClick={() => setActiveTab('rollcall')}
              className={cn(
                'inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                activeTab === 'rollcall'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              )}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{t('attendance.tabRollCall')}</span>
            </button>
          )}

          {canManageTeachers && (
            <button
              type="button"
              onClick={() => setActiveTab('teachers')}
              className={cn(
                'inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                activeTab === 'teachers'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              )}
            >
              <UserCog className="w-3.5 h-3.5" />
              <span>{t('attendance.tabTeacherAttendance')}</span>
            </button>
          )}

          {canViewWarnings && (
            <button
              type="button"
              onClick={() => setActiveTab('warnings')}
              className={cn(
                'inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                activeTab === 'warnings'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              )}
            >
              <AlertTriangle
                className={cn(
                  'w-3.5 h-3.5',
                  activeAlertsCount > 0 ? 'text-amber-600 dark:text-amber-400' : ''
                )}
              />
              <span className="tabular-nums">
                {t('attendance.tabWarnings')}
                {activeAlertsCount > 0 ? ` (${activeAlertsCount})` : ''}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('logbook')}
            className={cn(
              'inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer',
              activeTab === 'logbook'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            )}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>{t('attendance.tabLogbook')}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: STUDENT CLASS ROLL-CALL SHEET */}
      {activeTab === 'rollcall' && canTakeRollCall && (
        <div className="space-y-4">
          <Card className="p-4 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">{t('attendance.rollCallTitle')}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('attendance.rollCallDesc')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={roster.length === 0 || savingRollCall}
                  onClick={() => markAllDisplayed('present')}
                >
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{t('attendance.markAllPresent')}</span>
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={roster.length === 0 || savingRollCall}
                  onClick={() => markAllDisplayed('absent')}
                >
                  <X className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                  <span>{t('attendance.markAllAbsent')}</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  disabled={markedEntries.length === 0 || savingRollCall}
                  onClick={handleSaveRollCall}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span className="tabular-nums">
                    {savingRollCall
                      ? t('attendance.savingRollCall')
                      : t('attendance.saveRollCall', { count: markedEntries.length })}
                  </span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="sm:col-span-2 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={rollSearch}
                  onChange={(e) => setRollSearch(e.target.value)}
                  placeholder={t('attendance.searchStudentsPlaceholder')}
                  className="pl-9"
                />
              </div>

              <Select value={rollGradeFilter} onChange={(e) => setRollGradeFilter(e.target.value)}>
                <option value="">{t('students.allGrades')}</option>
                {ALL_GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>

              <Select
                value={rollSectionFilter}
                onChange={(e) => setRollSectionFilter(e.target.value)}
              >
                <option value="">{t('students.allSections')}</option>
                {SECTIONS.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </Select>
            </div>
          </Card>

          {rollFeedback && (
            <div className="space-y-2">
              <div
                role="alert"
                className={cn(
                  'flex items-start gap-2.5 p-3.5 rounded-xl border text-xs',
                  rollFeedback.type === 'success'
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                    : 'border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                )}
              >
                {rollFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{rollFeedback.message}</span>
              </div>

              {Boolean(rollFeedback.newlyTriggeredCount && rollFeedback.newlyTriggeredCount > 0) && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200">
                  <div className="flex items-center gap-2">
                    <BellRing className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                    <span className="font-medium tabular-nums">
                      {t('attendance.newlyTriggeredBanner', {
                        count: rollFeedback.newlyTriggeredCount,
                      })}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setActiveTab('warnings')}
                  >
                    <span>{t('attendance.viewWarningsBtn')}</span>
                  </Button>
                </div>
              )}
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">{t('attendance.colStudent')}</th>
                    <th className="py-3 px-4">{t('attendance.colClass')}</th>
                    <th className="py-3 px-4">{t('attendance.colMarkStatus')}</th>
                    <th className="py-3 px-4">{t('attendance.colNote')}</th>
                    <th className="py-3 px-4">{t('attendance.colRecordState')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loadingRollCall ? (
                    [1, 2, 3, 4].map((row) => (
                      <tr key={row} className="animate-pulse">
                        <td colSpan={5} className="py-3.5 px-4">
                          <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                        </td>
                      </tr>
                    ))
                  ) : roster.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-10 px-4 text-center text-sm text-slate-500 dark:text-slate-400"
                      >
                        {t('attendance.noStudentsToMark')}
                      </td>
                    </tr>
                  ) : (
                    roster.map((item) => {
                      const draft = drafts[item.student.id] || {
                        status: item.currentStatus,
                        notes: item.notes || '',
                      };
                      const currentStatus = draft.status;
                      const isDirty =
                        currentStatus !== item.currentStatus ||
                        (currentStatus !== null &&
                          draft.notes.trim() !== (item.notes || '').trim());

                      const initials = item.student.fullName
                        .split(/\s+/)
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase();

                      return (
                        <tr
                          key={item.student.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors text-xs"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3 min-w-0">
                              {item.student.photoUrl ? (
                                <img
                                  src={resolveAssetUrl(item.student.photoUrl)}
                                  alt={item.student.fullName}
                                  referrerPolicy="no-referrer"
                                  className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                                />
                              ) : (
                                <div
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                                  style={{ backgroundColor: 'var(--brand-primary, #0F4C81)' }}
                                >
                                  {initials || 'ST'}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                  {item.student.fullName}
                                </div>
                                <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                  {item.student.studentId}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap text-slate-700 dark:text-slate-300">
                            <div>{item.student.className}</div>
                            <div className="text-[11px] text-slate-400">{item.student.division}</div>
                          </td>

                          <td className="py-3 px-4">
                            <div
                              role="group"
                              aria-label={`${t('attendance.colMarkStatus')} ${item.student.fullName}`}
                              className="inline-flex flex-wrap items-center gap-1.5"
                            >
                              <button
                                type="button"
                                onClick={() => updateRowStatus(item.student.id, 'present')}
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                                  currentStatus === 'present'
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-600'
                                )}
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{t('attendance.statusPresent')}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => updateRowStatus(item.student.id, 'absent')}
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                                  currentStatus === 'absent'
                                    ? 'bg-red-600 text-white border-red-600 shadow-xs'
                                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-red-400 dark:hover:border-red-600'
                                )}
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>{t('attendance.statusAbsent')}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => updateRowStatus(item.student.id, 'late')}
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                                  currentStatus === 'late'
                                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-amber-400 dark:hover:border-amber-600'
                                )}
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>{t('attendance.statusLate')}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => updateRowStatus(item.student.id, 'excused')}
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                                  currentStatus === 'excused'
                                    ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-sky-400 dark:hover:border-sky-600'
                                )}
                              >
                                <FileCheck2 className="w-3.5 h-3.5" />
                                <span>{t('attendance.statusExcused')}</span>
                              </button>
                            </div>
                          </td>

                          <td className="py-3 px-4 min-w-[180px]">
                            <Input
                              value={draft.notes}
                              onChange={(e) => updateRowNotes(item.student.id, e.target.value)}
                              placeholder={t('attendance.noteRowPlaceholder')}
                              className="h-8 text-xs"
                              maxLength={240}
                            />
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap text-xs">
                            {isDirty ? (
                              <span className="font-medium text-amber-700 dark:text-amber-400">
                                {t('attendance.statePending')}
                              </span>
                            ) : item.currentStatus ? (
                              <div>
                                <div className="font-medium text-emerald-700 dark:text-emerald-400">
                                  {t('attendance.stateSaved')}
                                </div>
                                {item.recordedBy && (
                                  <div className="text-[11px] text-slate-400">
                                    {t('attendance.recordedByLabel', { name: item.recordedBy })}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">
                                {t('attendance.stateUnmarked')}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {roster.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                  <span>
                    {t('attendance.rollCallCountSummary', {
                      marked: markedEntries.length,
                      total: roster.length,
                    })}
                  </span>
                  {dirtyCount > 0 && (
                    <>
                      <span aria-hidden="true" className="mx-2">
                        ·
                      </span>
                      <span className="font-medium text-amber-700 dark:text-amber-400">
                        {t('attendance.unsavedBanner', { count: dirtyCount })}
                      </span>
                    </>
                  )}
                </div>

                <Button
                  type="button"
                  size="sm"
                  disabled={markedEntries.length === 0 || savingRollCall}
                  onClick={handleSaveRollCall}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span className="tabular-nums">
                    {savingRollCall
                      ? t('attendance.savingRollCall')
                      : t('attendance.saveRollCall', { count: markedEntries.length })}
                  </span>
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 2: TEACHER & FACULTY ATTENDANCE */}
      {activeTab === 'teachers' && canManageTeachers && (
        <div className="space-y-4">
          <Card className="p-4 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">{t('attendance.teacherRollCallTitle')}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('attendance.teacherRollCallDesc')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={teacherRoster.length === 0 || savingTeacherRollCall}
                  onClick={() => markAllTeachersDisplayed('present')}
                >
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{t('attendance.markAllPresent')}</span>
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={teacherRoster.length === 0 || savingTeacherRollCall}
                  onClick={() => markAllTeachersDisplayed('absent')}
                >
                  <X className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                  <span>{t('attendance.markAllAbsent')}</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  disabled={markedTeacherEntries.length === 0 || savingTeacherRollCall}
                  onClick={handleSaveTeacherRollCall}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span className="tabular-nums">
                    {savingTeacherRollCall
                      ? t('attendance.savingRollCall')
                      : t('attendance.saveTeacherAttendance', {
                          count: markedTeacherEntries.length,
                        })}
                  </span>
                </Button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  placeholder={t('attendance.searchTeachersPlaceholder')}
                  className="pl-9"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAllStaff}
                  onChange={(e) => setIncludeAllStaff(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700"
                />
                <span>{t('attendance.includeAllStaffLabel')}</span>
              </label>
            </div>
          </Card>

          {teacherFeedback && (
            <div className="space-y-2">
              <div
                role="alert"
                className={cn(
                  'flex items-start gap-2.5 p-3.5 rounded-xl border text-xs',
                  teacherFeedback.type === 'success'
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                    : 'border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                )}
              >
                {teacherFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{teacherFeedback.message}</span>
              </div>

              {Boolean(
                teacherFeedback.newlyTriggeredCount && teacherFeedback.newlyTriggeredCount > 0
              ) && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200">
                  <div className="flex items-center gap-2">
                    <BellRing className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                    <span className="font-medium tabular-nums">
                      {t('attendance.newlyTriggeredBanner', {
                        count: teacherFeedback.newlyTriggeredCount,
                      })}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setActiveTab('warnings')}
                  >
                    <span>{t('attendance.viewWarningsBtn')}</span>
                  </Button>
                </div>
              )}
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">{t('attendance.colTeacher')}</th>
                    <th className="py-3 px-4">{t('attendance.colDepartment')}</th>
                    <th className="py-3 px-4">{t('attendance.colMarkStatus')}</th>
                    <th className="py-3 px-4">{t('attendance.colNote')}</th>
                    <th className="py-3 px-4">{t('attendance.colRecordState')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loadingTeacherRollCall ? (
                    [1, 2, 3].map((row) => (
                      <tr key={row} className="animate-pulse">
                        <td colSpan={5} className="py-3.5 px-4">
                          <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                        </td>
                      </tr>
                    ))
                  ) : teacherRoster.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-10 px-4 text-center text-sm text-slate-500 dark:text-slate-400"
                      >
                        {t('attendance.noTeachersToMark')}
                      </td>
                    </tr>
                  ) : (
                    teacherRoster.map((item) => {
                      const draft = teacherDrafts[item.teacher.id] || {
                        status: item.currentStatus,
                        notes: item.notes || '',
                      };
                      const currentStatus = draft.status;
                      const isDirty =
                        currentStatus !== item.currentStatus ||
                        (currentStatus !== null &&
                          draft.notes.trim() !== (item.notes || '').trim());

                      const initials = item.teacher.fullName
                        .split(/\s+/)
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase();

                      return (
                        <tr
                          key={item.teacher.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors text-xs"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                                style={{ backgroundColor: 'var(--brand-primary, #0F4C81)' }}
                              >
                                {initials || 'TR'}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                  {item.teacher.fullName}
                                </div>
                                <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  @{item.teacher.username} · {item.teacher.email}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap text-slate-700 dark:text-slate-300">
                            <div>{item.teacher.roleName}</div>
                            <div className="text-[11px] text-slate-400">
                              {item.teacher.departmentName}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div
                              role="group"
                              aria-label={`${t('attendance.colMarkStatus')} ${item.teacher.fullName}`}
                              className="inline-flex flex-wrap items-center gap-1.5"
                            >
                              <button
                                type="button"
                                onClick={() => updateTeacherStatus(item.teacher.id, 'present')}
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                                  currentStatus === 'present'
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-600'
                                )}
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{t('attendance.statusPresent')}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => updateTeacherStatus(item.teacher.id, 'absent')}
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                                  currentStatus === 'absent'
                                    ? 'bg-red-600 text-white border-red-600 shadow-xs'
                                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-red-400 dark:hover:border-red-600'
                                )}
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>{t('attendance.statusAbsent')}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => updateTeacherStatus(item.teacher.id, 'late')}
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                                  currentStatus === 'late'
                                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-amber-400 dark:hover:border-amber-600'
                                )}
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>{t('attendance.statusLate')}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => updateTeacherStatus(item.teacher.id, 'excused')}
                                className={cn(
                                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                                  currentStatus === 'excused'
                                    ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-sky-400 dark:hover:border-sky-600'
                                )}
                              >
                                <FileCheck2 className="w-3.5 h-3.5" />
                                <span>{t('attendance.statusExcused')}</span>
                              </button>
                            </div>
                          </td>

                          <td className="py-3 px-4 min-w-[180px]">
                            <Input
                              value={draft.notes}
                              onChange={(e) => updateTeacherNotes(item.teacher.id, e.target.value)}
                              placeholder={t('attendance.noteRowPlaceholder')}
                              className="h-8 text-xs"
                              maxLength={240}
                            />
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap text-xs">
                            {isDirty ? (
                              <span className="font-medium text-amber-700 dark:text-amber-400">
                                {t('attendance.statePending')}
                              </span>
                            ) : item.currentStatus ? (
                              <div>
                                <div className="font-medium text-emerald-700 dark:text-emerald-400">
                                  {t('attendance.stateSaved')}
                                </div>
                                {item.recordedBy && (
                                  <div className="text-[11px] text-slate-400">
                                    {t('attendance.recordedByLabel', { name: item.recordedBy })}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">
                                {t('attendance.stateUnmarked')}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {teacherRoster.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                  <span>
                    {t('attendance.rollCallCountSummary', {
                      marked: markedTeacherEntries.length,
                      total: teacherRoster.length,
                    })}
                  </span>
                  {teacherDirtyCount > 0 && (
                    <>
                      <span aria-hidden="true" className="mx-2">
                        ·
                      </span>
                      <span className="font-medium text-amber-700 dark:text-amber-400">
                        {t('attendance.unsavedBanner', { count: teacherDirtyCount })}
                      </span>
                    </>
                  )}
                </div>

                <Button
                  type="button"
                  size="sm"
                  disabled={markedTeacherEntries.length === 0 || savingTeacherRollCall}
                  onClick={handleSaveTeacherRollCall}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span className="tabular-nums">
                    {savingTeacherRollCall
                      ? t('attendance.savingRollCall')
                      : t('attendance.saveTeacherAttendance', {
                          count: markedTeacherEntries.length,
                        })}
                  </span>
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: 3-DAY CONSECUTIVE ABSENCE WARNINGS & ATTENDANCE OFFICER FOLLOW-UP */}
      {activeTab === 'warnings' && canViewWarnings && (
        <div className="space-y-4">
          <Card className="p-4 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">{t('attendance.warningsTitle')}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('attendance.warningsDesc')}
                </p>
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={scanningWarnings}
                onClick={handleScanWarnings}
                className="shrink-0"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', scanningWarnings && 'animate-spin')} />
                <span>
                  {scanningWarnings
                    ? t('attendance.scanningWarnings')
                    : t('attendance.scanWarningsBtn')}
                </span>
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="sm:col-span-2 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={warningSearch}
                  onChange={(e) => setWarningSearch(e.target.value)}
                  placeholder={t('attendance.searchPlaceholder')}
                  className="pl-9"
                />
              </div>

              <Select
                value={warningSubjectFilter}
                onChange={(e) => setWarningSubjectFilter(e.target.value)}
              >
                <option value="">{t('attendance.filterAllSubjects')}</option>
                <option value="student">{t('attendance.filterStudentsOnly')}</option>
                <option value="teacher">{t('attendance.filterTeachersOnly')}</option>
              </Select>

              <Select
                value={warningStatusFilter}
                onChange={(e) => setWarningStatusFilter(e.target.value)}
              >
                <option value="active">{t('attendance.filterActiveWarnings')}</option>
                <option value="">{t('attendance.filterAllStatuses')}</option>
                <option value="open">{t('attendance.statusOpen')}</option>
                <option value="acknowledged">{t('attendance.statusAcknowledged')}</option>
                <option value="in_progress">{t('attendance.statusInProgress')}</option>
                <option value="resolved">{t('attendance.statusResolved')}</option>
                <option value="dismissed">{t('attendance.statusDismissed')}</option>
              </Select>
            </div>
          </Card>

          {warningFeedback && (
            <div className="flex items-center gap-2 p-3.5 rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/70 dark:bg-sky-950/30 text-xs text-sky-800 dark:text-sky-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{warningFeedback}</span>
            </div>
          )}

          {loadingWarnings ? (
            <Card className="p-6 space-y-3 animate-pulse">
              {[1, 2, 3].map((row) => (
                <div key={row} className="h-14 bg-slate-200 dark:bg-slate-800 rounded-lg" />
              ))}
            </Card>
          ) : warnings.length === 0 ? (
            <Card className="p-10 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('attendance.noWarningsTitle')}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {t('attendance.noWarningsDesc')}
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {warnings.map((w) => {
                const latestFollowUp = w.followUpNotes?.[0];
                return (
                  <Card
                    key={w.id}
                    className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {w.subjectType === 'teacher'
                            ? t('attendance.subjectTeacher')
                            : t('attendance.subjectStudent')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{w.subjectCode}</span>
                        <span aria-hidden="true">·</span>
                        <span>{w.subjectDetail}</span>
                        <span aria-hidden="true">·</span>
                        <span className={cn('font-semibold', getWarningStatusColor(w.status))}>
                          {getWarningStatusLabel(w.status)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-baseline gap-2.5">
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                          {w.subjectName}
                        </h3>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-xs font-semibold tabular-nums',
                            w.severity === 'critical'
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-amber-700 dark:text-amber-400'
                          )}
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {t('attendance.consecutiveDaysCount', { count: w.consecutiveDays })}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                        <span className="font-mono tabular-nums">
                          {t('attendance.absentDateRange')}: {w.absentDates.join(' · ')}
                        </span>
                        {w.contactPhone && (
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {w.contactPhone}
                          </span>
                        )}
                      </div>

                      {latestFollowUp && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {latestFollowUp.actionTaken}
                          </span>
                          {latestFollowUp.note ? ` — ${latestFollowUp.note}` : ''} ·{' '}
                          {latestFollowUp.recordedBy}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant={w.status === 'open' ? 'primary' : 'secondary'}
                        onClick={() => setFollowUpTarget(w)}
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>{t('attendance.logFollowUpBtn')}</span>
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ATTENDANCE LOGBOOK */}
      {activeTab === 'logbook' && (
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{t('attendance.logbookTitle')}</h2>
              {records.length > 0 && (
                <Button variant="secondary" size="sm" onClick={exportCsv}>
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('attendance.exportCsv')}</span>
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="lg:col-span-2 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder={t('attendance.searchPlaceholder')}
                  className="pl-9"
                />
              </div>

              <Select value={logGradeFilter} onChange={(e) => setLogGradeFilter(e.target.value)}>
                <option value="">{t('students.allGrades')}</option>
                {ALL_GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>

              <Select value={logStatusFilter} onChange={(e) => setLogStatusFilter(e.target.value)}>
                <option value="">{t('attendance.allStatuses')}</option>
                <option value="present">{t('attendance.statusPresent')}</option>
                <option value="absent">{t('attendance.statusAbsent')}</option>
                <option value="late">{t('attendance.statusLate')}</option>
                <option value="excused">{t('attendance.statusExcused')}</option>
              </Select>

              <Select
                value={logSessionFilter}
                onChange={(e) => setLogSessionFilter(e.target.value)}
              >
                <option value="">{t('attendance.allSessions')}</option>
                <option value="Morning">{t('attendance.sessionMorning')}</option>
                <option value="Afternoon">{t('attendance.sessionAfternoon')}</option>
                <option value="Full Day">{t('attendance.sessionFullDay')}</option>
              </Select>
            </div>
          </Card>

          {logError && (
            <Card className="p-4 border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              {logError}
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">{t('attendance.colTime')}</th>
                    <th className="py-3 px-4">{t('attendance.colStudent')}</th>
                    <th className="py-3 px-4">{t('attendance.colClass')}</th>
                    <th className="py-3 px-4">{t('attendance.colSession')}</th>
                    <th className="py-3 px-4">{t('attendance.colStatus')}</th>
                    <th className="py-3 px-4">{t('attendance.colMethod')}</th>
                    <th className="py-3 px-4">{t('attendance.colRecordedBy')}</th>
                    {canDelete && <th className="py-3 px-4 text-right">{t('common.actions')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loadingLog ? (
                    [1, 2, 3].map((row) => (
                      <tr key={row} className="animate-pulse">
                        <td colSpan={canDelete ? 8 : 7} className="py-3.5 px-4">
                          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                        </td>
                      </tr>
                    ))
                  ) : records.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canDelete ? 8 : 7}
                        className="py-10 px-4 text-center text-sm text-slate-500 dark:text-slate-400"
                      >
                        {t('attendance.emptyLogbook')}
                      </td>
                    </tr>
                  ) : (
                    records.map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors text-xs"
                      >
                        <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300">
                          <div>{r.date}</div>
                          <div className="text-[11px] text-slate-400">
                            {new Date(r.checkInTime).toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {r.studentName}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {r.studentCode}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">{r.className}</td>
                        <td className="py-3 px-4 whitespace-nowrap">{r.session}</td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className={cn('font-semibold', getStatusColor(r.status))}>
                            {getStatusLabel(r.status)}
                          </div>
                          {r.notes && (
                            <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                              {r.notes}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {getMethodLabel(r.method)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                          {r.recordedBy}
                        </td>
                        {canDelete && (
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteLog(r.id)}
                              title={t('common.delete')}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-600" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Attendance Officer Follow-Up Modal */}
      <AbsenceFollowUpModal
        warning={followUpTarget}
        onClose={() => setFollowUpTarget(null)}
        onSaved={async () => {
          await loadWarnings();
        }}
      />
    </div>
  );
}
