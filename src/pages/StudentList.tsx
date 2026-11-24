import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRightLeft,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Eye,
  FilterX,
  GraduationCap,
  Plus,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
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
  ALL_GRADES,
  PRIMARY_GRADES,
  SECTIONS,
  SECONDARY_GRADES,
  StudentFormModal,
} from '../components/students/StudentFormModal';
import { StudentPromotionModal } from '../components/students/StudentPromotionModal';
import { Button, Card, Input, Label, Modal, Select } from '../components/ui/Primitives';
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../contexts/BrandingContext';
import { apiRequest, resolveAssetUrl } from '../services/api';
import type {
  StudentListResponse,
  StudentQrCard,
  StudentRecord,
  StudentStatus,
} from '../types/nexus';
import { cn } from '../utils/cn';
import { generateStudentIdCardsPdf } from '../utils/studentIdCardPdf';

const CURRENT_ACADEMIC_YEAR = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
const TODAY_ISO = new Date().toISOString().slice(0, 10);

export function StudentList() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { settings } = useBranding();

  // Filters & Pagination
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [divisionFilter, setDivisionFilter] = useState<string>('');
  const [gradeFilter, setGradeFilter] = useState<string>('');
  const [sectionFilter, setSectionFilter] = useState<string>('');
  const [genderFilter, setGenderFilter] = useState<string>('');
  const [yearFilter, setYearFilter] = useState<string>('');
  const [sortOption, setSortOption] = useState<string>('createdAt:desc');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Data state
  const [data, setData] = useState<StudentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const [inspectStudent, setInspectStudent] = useState<StudentRecord | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [generatingIdPdf, setGeneratingIdPdf] = useState(false);

  const [transitionTarget, setTransitionTarget] = useState<StudentRecord | null>(null);
  const [transitionStatus, setTransitionStatus] = useState<StudentStatus>('active');
  const [transitionGrade, setTransitionGrade] = useState('');
  const [transitionSection, setTransitionSection] = useState('A');
  const [transitionYear, setTransitionYear] = useState(CURRENT_ACADEMIC_YEAR);
  const [transitionNote, setTransitionNote] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<StudentRecord | null>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sortBy, sortOrder] = sortOption.split(':');
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortOrder,
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      if (divisionFilter) params.set('division', divisionFilter);
      if (gradeFilter) params.set('gradeLevel', gradeFilter);
      if (sectionFilter) params.set('section', sectionFilter);
      if (genderFilter) params.set('gender', genderFilter);
      if (yearFilter) params.set('academicYear', yearFilter);

      const res = await apiRequest<StudentListResponse>(`/api/students?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, [
    debouncedSearch,
    statusFilter,
    divisionFilter,
    gradeFilter,
    sectionFilter,
    genderFilter,
    yearFilter,
    sortOption,
    page,
  ]);

  const hasActiveFilters = Boolean(
    searchInput ||
      statusFilter ||
      divisionFilter ||
      gradeFilter ||
      sectionFilter ||
      genderFilter ||
      yearFilter
  );

  const clearAllFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setStatusFilter('');
    setDivisionFilter('');
    setGradeFilter('');
    setSectionFilter('');
    setGenderFilter('');
    setYearFilter('');
    setPage(1);
  };

  const openCreateModal = () => {
    setEditingStudent(null);
    setFormOpen(true);
  };

  const openEditModal = (s: StudentRecord) => {
    setEditingStudent(s);
    setFormOpen(true);
  };

  const openTransitionModal = (s: StudentRecord) => {
    setTransitionTarget(s);
    setTransitionStatus(s.status);
    setTransitionGrade(s.gradeLevel);
    setTransitionSection(s.section);
    setTransitionYear(s.academicYear);
    setTransitionNote('');
  };

  const handleTransitionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transitionTarget) return;
    setSaving(true);
    try {
      const res = await apiRequest<{ student: StudentRecord }>(
        `/api/students/${transitionTarget.id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: transitionStatus,
            gradeLevel: transitionGrade,
            section: transitionSection,
            academicYear: transitionYear,
            note: transitionNote,
          }),
        }
      );
      if (inspectStudent?.id === transitionTarget.id) {
        setInspectStudent(res.student);
      }
      setTransitionTarget(null);
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!inspectStudent) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError('Student photograph must be under 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== 'string') return;
      setPhotoUploading(true);
      try {
        const res = await apiRequest<{ student: StudentRecord }>(
          `/api/students/${inspectStudent.id}/photo`,
          {
            method: 'POST',
            body: JSON.stringify({ dataUrl: reader.result }),
          }
        );
        setInspectStudent(res.student);
        await loadStudents();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.errorGeneric'));
      } finally {
        setPhotoUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadIdCardPdf = async (student: StudentRecord) => {
    setGeneratingIdPdf(true);
    setError(null);
    try {
      const qrCard = await apiRequest<StudentQrCard & { issuedAt: string }>(
        `/api/attendance/qr/${student.id}`
      );
      await generateStudentIdCardsPdf({
        cards: [qrCard],
        settings,
        layout: 'cr80',
        badgeSubtitle: t('attendance.idCardBadgeLabel'),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setGeneratingIdPdf(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/students/${deleteTarget.id}`, { method: 'DELETE' });
      if (inspectStudent?.id === deleteTarget.id) setInspectStudent(null);
      setDeleteTarget(null);
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    if (!data?.students.length) return;
    const headers = [
      'Student ID',
      'Admission No',
      'Full Name',
      'Gender',
      'Division',
      'Class',
      'Academic Year',
      'Status',
      'Guardian Name',
      'Guardian Phone',
      'Admission Date',
    ];
    const rows = data.students.map((s) =>
      [
        s.studentId,
        s.admissionNumber,
        s.fullName,
        s.gender,
        s.division,
        s.className,
        s.academicYear,
        s.status,
        s.guardian.fullName,
        s.guardian.phone,
        s.admissionDate,
      ]
        .map((v) => `"${String(v || '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `students-export-${TODAY_ISO}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusLabel = (status: StudentStatus) => {
    const map: Record<StudentStatus, string> = {
      active: t('students.statusActive'),
      applicant: t('students.statusApplicant'),
      transferred: t('students.statusTransferred'),
      graduated: t('students.statusGraduated'),
      archived: t('students.statusArchived'),
    };
    return map[status] || status;
  };

  const getStatusColor = (status: StudentStatus) => {
    switch (status) {
      case 'active':
        return 'text-emerald-700 dark:text-emerald-400';
      case 'applicant':
        return 'text-amber-700 dark:text-amber-400';
      case 'graduated':
        return 'text-sky-700 dark:text-sky-400';
      default:
        return 'text-slate-500 dark:text-slate-400';
    }
  };

  const students = data?.students || [];
  const pagination = data?.pagination;
  const summary = data?.summary;
  const fromIdx = pagination && pagination.totalItems > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const toIdx = pagination ? Math.min(pagination.page * pagination.pageSize, pagination.totalItems) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('students.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('students.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {students.length > 0 && (
            <Button variant="secondary" size="sm" onClick={exportCsv}>
              <Download className="w-3.5 h-3.5" />
              <span>{t('students.exportCsv')}</span>
            </Button>
          )}
          {can('students', 'edit') && (
            <Button variant="secondary" size="sm" onClick={() => setPromotionOpen(true)}>
              <GraduationCap className="w-3.5 h-3.5" />
              <span>{t('students.promotion.buttonLabel')}</span>
            </Button>
          )}
          {can('students', 'create') && (
            <Button onClick={openCreateModal}>
              <UserPlus className="w-4 h-4" />
              <span>{t('students.registerStudent')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Summary Header: Key Metrics + Students by Class Level Recharts Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-5 grid grid-cols-2 gap-4">
          <Card className="p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{t('students.activeEnrolled')}</span>
              <GraduationCap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {summary?.active ?? 0}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                {t('students.totalStudents')}: {summary?.total ?? 0}
              </div>
            </div>
          </Card>

          <Card className="p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{t('students.newThisMonth')}</span>
              <CalendarPlus className="w-4 h-4 text-sky-700 dark:text-sky-400" />
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {summary?.newThisMonth ?? 0}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                {t('students.newThisMonthHint', { month: TODAY_ISO.slice(0, 7) })}
              </div>
            </div>
          </Card>

          <Card className="p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{t('students.applicantsCount')}</span>
              <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {summary?.applicant ?? 0}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                {t('students.statusGraduated')}: {summary?.graduated ?? 0}
              </div>
            </div>
          </Card>

          <Card className="p-4 flex flex-col justify-between">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t('students.divisionSplit')}
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tabular-nums">
                {summary?.primary ?? 0}{' '}
                <span className="text-slate-400 dark:text-slate-500 font-normal">/</span>{' '}
                {summary?.secondary ?? 0}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t('students.primaryDivision')} · {t('students.secondaryDivision')}
              </div>
            </div>
          </Card>
        </div>

        <Card className="lg:col-span-7 p-4 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-semibold">{t('students.studentsByClassLevel')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('students.classLevelOverviewDesc')}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 shrink-0">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-xs inline-block"
                  style={{ backgroundColor: settings?.primaryColor || '#0F4C81' }}
                />
                <span>{t('students.activeStudentsChart')}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-xs inline-block"
                  style={{ backgroundColor: settings?.accentColor || '#059669' }}
                />
                <span>{t('students.totalStudentsChart')}</span>
              </span>
            </div>
          </div>

          {(summary?.total ?? 0) === 0 ? (
            <div className="h-44 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg px-4 text-center">
              {t('students.noClassDataYet')}
            </div>
          ) : (
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={summary?.byGradeLevel || []}
                  margin={{ top: 6, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="shortLabel" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    labelFormatter={(_label, payload) =>
                      payload?.[0]?.payload?.gradeLevel || String(_label)
                    }
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid rgba(148,163,184,0.3)',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="active"
                    name={t('students.activeStudentsChart')}
                    fill={settings?.primaryColor || '#0F4C81'}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="total"
                    name={t('students.totalStudentsChart')}
                    fill={settings?.accentColor || '#059669'}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Status Segmented Tabs & Advanced Multi-Facet Filter Bar */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            {(
              [
                { value: '', label: t('students.allStatuses') },
                { value: 'active', label: t('students.statusActive') },
                { value: 'applicant', label: t('students.statusApplicant') },
                { value: 'transferred', label: t('students.statusTransferred') },
                { value: 'graduated', label: t('students.statusGraduated') },
                { value: 'archived', label: t('students.statusArchived') },
              ] as Array<{ value: string; label: string }>
            ).map((tab) => (
              <button
                key={tab.value || 'all'}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.value);
                  setPage(1);
                }}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                  statusFilter === tab.value
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters}>
              <FilterX className="w-3.5 h-3.5" />
              <span>{t('students.clearFilters')}</span>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('students.searchPlaceholder')}
              className="pl-9"
            />
          </div>

          <Select
            value={divisionFilter}
            onChange={(e) => {
              setDivisionFilter(e.target.value);
              setGradeFilter('');
              setPage(1);
            }}
          >
            <option value="">{t('students.allDivisions')}</option>
            <option value="Primary">{t('students.primaryDivision')}</option>
            <option value="Secondary">{t('students.secondaryDivision')}</option>
          </Select>

          <Select
            value={gradeFilter}
            onChange={(e) => {
              setGradeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('students.allGrades')}</option>
            {(divisionFilter === 'Primary'
              ? PRIMARY_GRADES
              : divisionFilter === 'Secondary'
                ? SECONDARY_GRADES
                : ALL_GRADES
            ).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>

          <Select
            value={sectionFilter}
            onChange={(e) => {
              setSectionFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('students.allSections')}</option>
            {SECTIONS.map((sec) => (
              <option key={sec} value={sec}>
                {sec}
              </option>
            ))}
          </Select>

          <Select
            value={genderFilter}
            onChange={(e) => {
              setGenderFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('students.allGenders')}</option>
            <option value="male">{t('students.male')}</option>
            <option value="female">{t('students.female')}</option>
          </Select>

          <Select value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
            <option value="createdAt:desc">{t('students.sortNewest')}</option>
            <option value="fullName:asc">{t('students.sortNameAsc')}</option>
            <option value="studentId:asc">{t('students.sortIdAsc')}</option>
            <option value="admissionDate:desc">{t('students.sortAdmissionDesc')}</option>
          </Select>
        </div>

        {(data?.facets.academicYears?.length || 0) > 1 && (
          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs text-slate-500">{t('students.academicYear')}:</span>
            <Select
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(e.target.value);
                setPage(1);
              }}
              className="w-44 h-8 text-xs"
            >
              <option value="">{t('students.allYears')}</option>
              {data?.facets.academicYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </Select>
          </div>
        )}
      </Card>

      {error && (
        <Card className="p-4 border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
          {error}
        </Card>
      )}

      {/* Student Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">{t('students.studentId')}</th>
                <th className="py-3 px-4">{t('students.fullName')}</th>
                <th className="py-3 px-4">{t('students.className')}</th>
                <th className="py-3 px-4">{t('students.guardianSection')}</th>
                <th className="py-3 px-4">{t('common.status')}</th>
                <th className="py-3 px-4">{t('students.admissionDate')}</th>
                <th className="py-3 px-4 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                [1, 2, 3, 4].map((row) => (
                  <tr key={row} className="animate-pulse">
                    <td colSpan={7} className="py-3.5 px-4">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center space-y-3">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t('students.emptyTitle')}
                    </p>
                    {can('students', 'create') && (
                      <div>
                        <Button size="sm" onClick={openCreateModal}>
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t('students.emptyAction')}</span>
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                students.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-xs tabular-nums whitespace-nowrap">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {s.studentId}
                      </div>
                      <div className="text-[11px] text-slate-500">{s.admissionNumber}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {s.photoUrl ? (
                          <img
                            src={resolveAssetUrl(s.photoUrl)}
                            alt={s.fullName}
                            referrerPolicy="no-referrer"
                            className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                          />
                        ) : (
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                            style={{ backgroundColor: 'var(--brand-primary, #0F4C81)' }}
                          >
                            {s.fullName
                              .split(' ')
                              .map((p) => p[0])
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                            {s.fullName}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {s.gender === 'male' ? t('students.male') : t('students.female')} ·{' '}
                            <span className="font-mono tabular-nums">{s.dateOfBirth}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      <div className="font-medium">{s.className}</div>
                      <div className="text-slate-500">
                        {s.division} · <span className="font-mono tabular-nums">{s.academicYear}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {s.guardian.fullName}
                      </div>
                      <div className="text-slate-500 font-mono tabular-nums">
                        {s.guardian.relationship} · {s.guardian.phone}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      <span className={cn('font-semibold', getStatusColor(s.status))}>
                        {getStatusLabel(s.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {s.admissionDate}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setInspectStudent(s)}
                          title={t('students.viewProfile')}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {can('students', 'edit') && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openEditModal(s)}>
                              {t('common.edit')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openTransitionModal(s)}
                              title={t('students.changeStatus')}
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                        {can('students', 'delete') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(s)}
                            title={t('common.delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-600" />
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

        {/* Pagination */}
        {pagination && pagination.totalItems > 0 && (
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="tabular-nums">
              {t('students.showingResults', {
                from: fromIdx,
                to: toIdx,
                total: pagination.totalItems,
              })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>{t('students.previousPage')}</span>
              </Button>
              <span className="font-mono tabular-nums px-2">
                {pagination.page} / {pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              >
                <span>{t('students.nextPage')}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Register / Edit Student Modal */}
      <StudentFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        student={editingStudent}
        onSaved={async (saved) => {
          if (inspectStudent?.id === saved.id) {
            setInspectStudent(saved);
          }
          await loadStudents();
        }}
      />

      {/* Year-End Student Promotion Modal */}
      <StudentPromotionModal
        open={promotionOpen}
        onClose={() => setPromotionOpen(false)}
        availableAcademicYears={data?.facets.academicYears || []}
        onPromoted={loadStudents}
      />

      {/* Profile Inspector Modal */}
      <Modal
        open={Boolean(inspectStudent)}
        onClose={() => setInspectStudent(null)}
        title={t('students.profileTitle')}
        subtitle={
          inspectStudent ? `${inspectStudent.studentId} · ${inspectStudent.className}` : undefined
        }
        maxWidth="max-w-2xl"
      >
        {inspectStudent && (
          <div className="space-y-6 text-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-4">
                {inspectStudent.photoUrl ? (
                  <img
                    src={resolveAssetUrl(inspectStudent.photoUrl)}
                    alt={inspectStudent.fullName}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center text-lg font-bold text-white"
                    style={{ backgroundColor: 'var(--brand-primary, #0F4C81)' }}
                  >
                    {inspectStudent.fullName
                      .split(' ')
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold">{inspectStudent.fullName}</h3>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {inspectStudent.studentId} · {inspectStudent.admissionNumber} ·{' '}
                    <span className={getStatusColor(inspectStudent.status)}>
                      {getStatusLabel(inspectStudent.status)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {inspectStudent.status === 'active' &&
                  (can('attendance', 'view') || can('students', 'view')) && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={generatingIdPdf}
                      onClick={() => handleDownloadIdCardPdf(inspectStudent)}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>
                        {generatingIdPdf
                          ? t('attendance.generatingPdf')
                          : t('attendance.downloadIdPdf')}
                      </span>
                    </Button>
                  )}

                {can('students', 'edit') && (
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{photoUploading ? t('common.saving') : t('students.uploadPhoto')}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">{t('students.division')}</span>
                  <span className="font-medium">{inspectStudent.division}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">{t('students.className')}</span>
                  <span className="font-medium">{inspectStudent.className}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">{t('students.academicYear')}</span>
                  <span className="font-mono">{inspectStudent.academicYear}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">{t('students.dateOfBirth')}</span>
                  <span className="font-mono">{inspectStudent.dateOfBirth}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">{t('students.nationality')}</span>
                  <span>{inspectStudent.nationality}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">{t('students.guardianName')}</span>
                  <span className="font-medium">{inspectStudent.guardian.fullName}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">{t('students.guardianRelationship')}</span>
                  <span>{inspectStudent.guardian.relationship}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">{t('students.guardianPhone')}</span>
                  <span className="font-mono">{inspectStudent.guardian.phone}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">{t('students.emergencyPhone')}</span>
                  <span className="font-mono">{inspectStudent.emergencyContact?.phone || '—'}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">{t('students.address')}</span>
                  <span>{inspectStudent.address || '—'}</span>
                </div>
              </div>
            </div>

            {inspectStudent.medicalNotes && (
              <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 text-xs">
                <strong className="block mb-1">{t('students.medicalNotes')}</strong>
                <span>{inspectStudent.medicalNotes}</span>
              </div>
            )}

            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                {t('students.historyTitle')}
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(inspectStudent.history || []).map((h) => (
                  <div
                    key={h.id}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs flex items-start justify-between gap-3"
                  >
                    <div>
                      <div className="font-medium capitalize">
                        {h.type} · {h.gradeLevel} ({h.section})
                      </div>
                      <div className="text-slate-500 mt-0.5">{h.note}</div>
                    </div>
                    <div className="text-right text-[11px] font-mono text-slate-500 shrink-0">
                      <div>{new Date(h.timestamp).toLocaleDateString()}</div>
                      <div>{h.recordedBy}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Transition / Promote Modal */}
      <Modal
        open={Boolean(transitionTarget)}
        onClose={() => setTransitionTarget(null)}
        title={t('students.promoteStudent')}
        subtitle={transitionTarget?.fullName}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleTransitionSubmit} className="space-y-4">
          <div>
            <Label>{t('common.status')}</Label>
            <Select
              value={transitionStatus}
              onChange={(e) => setTransitionStatus(e.target.value as StudentStatus)}
            >
              <option value="active">{t('students.statusActive')}</option>
              <option value="applicant">{t('students.statusApplicant')}</option>
              <option value="transferred">{t('students.statusTransferred')}</option>
              <option value="graduated">{t('students.statusGraduated')}</option>
              <option value="archived">{t('students.statusArchived')}</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('students.gradeLevel')}</Label>
              <Select value={transitionGrade} onChange={(e) => setTransitionGrade(e.target.value)}>
                {ALL_GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t('students.section')}</Label>
              <Select
                value={transitionSection}
                onChange={(e) => setTransitionSection(e.target.value)}
              >
                {SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>{t('students.academicYear')}</Label>
            <Input
              value={transitionYear}
              onChange={(e) => setTransitionYear(e.target.value)}
              className="font-mono"
            />
          </div>
          <div>
            <Label>{t('students.transitionNote')}</Label>
            <Input
              value={transitionNote}
              onChange={(e) => setTransitionNote(e.target.value)}
              placeholder="Promoted after annual examination"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setTransitionTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('common.saving') : t('common.confirm')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={t('students.confirmDeleteTitle')}
        subtitle={deleteTarget ? `${deleteTarget.fullName} (${deleteTarget.studentId})` : undefined}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t('students.confirmDeleteDesc')}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete} disabled={saving}>
              {saving ? t('common.saving') : t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
