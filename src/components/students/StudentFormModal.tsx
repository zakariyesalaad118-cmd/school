import { zodResolver } from '@hookform/resolvers/zod';
import type { TFunction } from 'i18next';
import {
  AlertCircle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Phone,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button, Input, Label, Modal, Select } from '../ui/Primitives';
import { apiRequest, resolveAssetUrl } from '../../services/api';
import type { StudentRecord } from '../../types/nexus';
import { cn } from '../../utils/cn';

export const PRIMARY_GRADES = [
  'Grade 1',
  'Grade 2',
  'Grade 3',
  'Grade 4',
  'Grade 5',
  'Grade 6',
  'Grade 7',
  'Grade 8',
] as const;

export const SECONDARY_GRADES = ['Form 1', 'Form 2', 'Form 3', 'Form 4'] as const;
export const ALL_GRADES = [...PRIMARY_GRADES, ...SECONDARY_GRADES];
export const SECTIONS = ['A', 'B', 'C', 'D'] as const;

const TODAY_ISO = new Date().toISOString().slice(0, 10);
const CURRENT_ACADEMIC_YEAR = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

type FormTabId = 'identity' | 'academic' | 'contacts';

const IDENTITY_FIELDS: Array<keyof StudentFormValues> = [
  'fullName',
  'gender',
  'dateOfBirth',
  'studentId',
  'admissionNumber',
  'nationality',
];

const ACADEMIC_FIELDS: Array<keyof StudentFormValues> = [
  'division',
  'gradeLevel',
  'section',
  'academicYear',
  'admissionDate',
  'status',
  'previousSchool',
  'medicalNotes',
];

const CONTACT_FIELDS: Array<keyof StudentFormValues> = [
  'phone',
  'email',
  'address',
  'guardianFullName',
  'guardianRelationship',
  'guardianPhone',
  'guardianEmail',
  'guardianOccupation',
  'guardianAddress',
  'emergencyFullName',
  'emergencyRelationship',
  'emergencyPhone',
];

function isValidPhone(val: string): boolean {
  const cleaned = val.trim();
  if (!/^[+\d\s()-]+$/.test(cleaned)) return false;
  const digits = cleaned.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 20;
}

function isValidIsoDate(val: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const parsed = new Date(`${val}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === val;
}

function isRealisticStudentDob(val: string): boolean {
  if (!isValidIsoDate(val)) return false;
  const dob = new Date(`${val}T00:00:00Z`);
  const now = new Date();
  if (dob > now) return false;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age >= 3 && age <= 30;
}

function createStudentFormSchema(t: TFunction) {
  const optionalCodeSchema = z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === '' || /^[A-Za-z0-9_-]{3,40}$/.test(v), {
      message: t('students.validation.codeFormat'),
    })
    .optional()
    .default('');

  const optionalEmailSchema = z
    .string()
    .trim()
    .refine((v) => v === '' || z.string().email().safeParse(v).success, {
      message: t('students.validation.emailInvalid'),
    })
    .optional()
    .default('');

  const optionalPhoneSchema = z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === '' || isValidPhone(v), {
      message: t('students.validation.phoneInvalid'),
    })
    .optional()
    .default('');

  return z
    .object({
      studentId: optionalCodeSchema,
      admissionNumber: optionalCodeSchema,
      fullName: z
        .string()
        .trim()
        .min(2, t('students.validation.fullNameMin'))
        .max(120, t('students.validation.fullNameMax')),
      gender: z.enum(['male', 'female']),
      dateOfBirth: z
        .string()
        .trim()
        .min(1, t('students.validation.dobRequired'))
        .refine(isRealisticStudentDob, t('students.validation.dobInvalid')),
      nationality: z.string().trim().max(60).optional().default('Somali'),
      email: optionalEmailSchema,
      phone: optionalPhoneSchema,
      address: z
        .string()
        .trim()
        .max(200)
        .refine((v) => v === '' || v.length >= 3, {
          message: t('students.validation.addressMin'),
        })
        .optional()
        .default(''),
      division: z.enum(['Primary', 'Secondary']),
      gradeLevel: z.string().trim().min(1, t('students.validation.gradeRequired')),
      section: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9]{1,10}$/, t('students.validation.sectionRequired')),
      academicYear: z
        .string()
        .trim()
        .refine((val) => {
          const match = /^(\d{4})-(\d{4})$/.exec(val);
          if (!match) return false;
          return Number(match[2]) === Number(match[1]) + 1;
        }, t('students.validation.academicYearFormat')),
      admissionDate: z
        .string()
        .trim()
        .min(1, t('students.validation.admissionDateRequired'))
        .refine(isValidIsoDate, t('students.validation.admissionDateRequired')),
      previousSchool: z
        .string()
        .trim()
        .max(120)
        .refine((v) => v === '' || v.length >= 2, {
          message: t('students.validation.previousSchoolMin'),
        })
        .optional()
        .default(''),
      medicalNotes: z.string().trim().max(400).optional().default(''),
      status: z.enum(['active', 'applicant', 'transferred', 'graduated', 'archived']),
      guardianFullName: z
        .string()
        .trim()
        .min(2, t('students.validation.guardianNameMin'))
        .max(120),
      guardianRelationship: z
        .string()
        .trim()
        .min(2, t('students.validation.guardianRelRequired'))
        .max(60),
      guardianPhone: z
        .string()
        .trim()
        .max(40)
        .refine((v) => isValidPhone(v), {
          message: t('students.validation.guardianPhoneRequired'),
        }),
      guardianEmail: optionalEmailSchema,
      guardianOccupation: z.string().trim().max(80).optional().default(''),
      guardianAddress: z
        .string()
        .trim()
        .max(200)
        .refine((v) => v === '' || v.length >= 3, {
          message: t('students.validation.addressMin'),
        })
        .optional()
        .default(''),
      emergencyFullName: z.string().trim().max(120).optional().default(''),
      emergencyRelationship: z.string().trim().max(60).optional().default(''),
      emergencyPhone: optionalPhoneSchema,
    })
    .superRefine((values, ctx) => {
      const validPrimary = (PRIMARY_GRADES as readonly string[]).includes(values.gradeLevel);
      const validSecondary = (SECONDARY_GRADES as readonly string[]).includes(values.gradeLevel);
      if (
        (values.division === 'Primary' && !validPrimary) ||
        (values.division === 'Secondary' && !validSecondary)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['gradeLevel'],
          message: t('students.validation.divisionMismatch'),
        });
      }

      if (
        isValidIsoDate(values.dateOfBirth) &&
        isValidIsoDate(values.admissionDate) &&
        values.admissionDate < values.dateOfBirth
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['admissionDate'],
          message: t('students.validation.admissionBeforeDob'),
        });
      }

      const hasEmergencyAny = Boolean(
        values.emergencyFullName || values.emergencyRelationship || values.emergencyPhone
      );
      if (hasEmergencyAny) {
        if (!values.emergencyFullName || values.emergencyFullName.length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['emergencyFullName'],
            message: t('students.validation.emergencyPairName'),
          });
        }
        if (!values.emergencyPhone || !isValidPhone(values.emergencyPhone)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['emergencyPhone'],
            message: t('students.validation.emergencyPairPhone'),
          });
        }
      }
    });
}

export type StudentFormValues = z.infer<ReturnType<typeof createStudentFormSchema>>;

interface StudentFormModalProps {
  open: boolean;
  onClose: () => void;
  student: StudentRecord | null;
  onSaved: (saved: StudentRecord) => void | Promise<void>;
}

function getDefaultValues(student: StudentRecord | null): StudentFormValues {
  if (student) {
    return {
      studentId: student.studentId || '',
      admissionNumber: student.admissionNumber || '',
      fullName: student.fullName || '',
      gender: student.gender || 'male',
      dateOfBirth: student.dateOfBirth || '2014-01-15',
      nationality: student.nationality || 'Somali',
      email: student.email || '',
      phone: student.phone || '',
      address: student.address || '',
      division: student.division || 'Primary',
      gradeLevel: student.gradeLevel || 'Grade 1',
      section: student.section || 'A',
      academicYear: student.academicYear || CURRENT_ACADEMIC_YEAR,
      admissionDate: student.admissionDate || TODAY_ISO,
      previousSchool: student.previousSchool || '',
      medicalNotes: student.medicalNotes || '',
      status: student.status || 'active',
      guardianFullName: student.guardian?.fullName || '',
      guardianRelationship: student.guardian?.relationship || 'Father',
      guardianPhone: student.guardian?.phone || '',
      guardianEmail: student.guardian?.email || '',
      guardianOccupation: student.guardian?.occupation || '',
      guardianAddress: student.guardian?.address || '',
      emergencyFullName: student.emergencyContact?.fullName || '',
      emergencyRelationship: student.emergencyContact?.relationship || '',
      emergencyPhone: student.emergencyContact?.phone || '',
    };
  }

  return {
    studentId: '',
    admissionNumber: '',
    fullName: '',
    gender: 'male',
    dateOfBirth: '2014-01-15',
    nationality: 'Somali',
    email: '',
    phone: '',
    address: '',
    division: 'Primary',
    gradeLevel: 'Grade 1',
    section: 'A',
    academicYear: CURRENT_ACADEMIC_YEAR,
    admissionDate: TODAY_ISO,
    previousSchool: '',
    medicalNotes: '',
    status: 'active',
    guardianFullName: '',
    guardianRelationship: 'Father',
    guardianPhone: '',
    guardianEmail: '',
    guardianOccupation: '',
    guardianAddress: '',
    emergencyFullName: '',
    emergencyRelationship: '',
    emergencyPhone: '',
  };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 flex items-start gap-1 text-xs text-red-600 dark:text-red-400">
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{message}</span>
    </p>
  );
}

export function StudentFormModal({ open, onClose, student, onSaved }: StudentFormModalProps) {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<FormTabId>('identity');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingPhotoDataUrl, setPendingPhotoDataUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const schema = useMemo(() => createStudentFormSchema(t), [t, i18n.language]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setFocus,
    formState: { errors, submitCount },
  } = useForm<StudentFormValues>({
    resolver: zodResolver(schema) as any,
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: getDefaultValues(student),
  });

  useEffect(() => {
    if (open) {
      reset(getDefaultValues(student));
      setActiveTab('identity');
      setSubmitError(null);
      setPendingPhotoDataUrl(null);
      setPhotoError(null);
    }
  }, [open, student, reset]);

  const watchedDivision = watch('division');
  const watchedGrade = watch('gradeLevel');
  const watchedSection = watch('section');
  const watchedYear = watch('academicYear');
  const watchedFullName = watch('fullName');

  const tabErrorCounts = useMemo(() => {
    const countFields = (fields: Array<keyof StudentFormValues>) =>
      fields.filter((f) => Boolean(errors[f])).length;
    return {
      identity: countFields(IDENTITY_FIELDS),
      academic: countFields(ACADEMIC_FIELDS),
      contacts: countFields(CONTACT_FIELDS),
    };
  }, [errors]);

  const totalErrorCount =
    tabErrorCounts.identity + tabErrorCounts.academic + tabErrorCounts.contacts;

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setPhotoError(t('students.validation.photoInvalidType'));
      return;
    }
    if (file.size > 1024 * 1024) {
      setPhotoError(t('students.validation.photoTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPendingPhotoDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleInvalidSubmit = (fieldErrors: FieldErrors<StudentFormValues>) => {
    const firstIdentity = IDENTITY_FIELDS.find((f) => Boolean(fieldErrors[f]));
    const firstAcademic = ACADEMIC_FIELDS.find((f) => Boolean(fieldErrors[f]));
    const firstContact = CONTACT_FIELDS.find((f) => Boolean(fieldErrors[f]));

    if (firstIdentity) {
      setActiveTab('identity');
      setTimeout(() => setFocus(firstIdentity), 0);
    } else if (firstAcademic) {
      setActiveTab('academic');
      setTimeout(() => setFocus(firstAcademic), 0);
    } else if (firstContact) {
      setActiveTab('contacts');
      setTimeout(() => setFocus(firstContact), 0);
    }
  };

  const onValidSubmit = async (values: StudentFormValues) => {
    setSaving(true);
    setSubmitError(null);
    try {
      const payload = {
        studentId: values.studentId,
        admissionNumber: values.admissionNumber,
        fullName: values.fullName,
        gender: values.gender,
        dateOfBirth: values.dateOfBirth,
        nationality: values.nationality || 'Somali',
        email: values.email || '',
        phone: values.phone || '',
        address: values.address || '',
        division: values.division,
        gradeLevel: values.gradeLevel,
        section: values.section.toUpperCase(),
        academicYear: values.academicYear,
        admissionDate: values.admissionDate,
        previousSchool: values.previousSchool || '',
        medicalNotes: values.medicalNotes || '',
        status: values.status,
        guardian: {
          fullName: values.guardianFullName,
          relationship: values.guardianRelationship,
          phone: values.guardianPhone,
          email: values.guardianEmail || '',
          occupation: values.guardianOccupation || '',
          address: values.guardianAddress || '',
        },
        emergencyContact: {
          fullName: values.emergencyFullName || '',
          relationship: values.emergencyRelationship || '',
          phone: values.emergencyPhone || '',
        },
      };

      const res = student
        ? await apiRequest<{ student: StudentRecord }>(`/api/students/${student.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiRequest<{ student: StudentRecord }>('/api/students', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      let savedStudent = res.student;

      if (pendingPhotoDataUrl) {
        const photoRes = await apiRequest<{ student: StudentRecord }>(
          `/api/students/${savedStudent.id}/photo`,
          {
            method: 'POST',
            body: JSON.stringify({ dataUrl: pendingPhotoDataUrl }),
          }
        );
        savedStudent = photoRes.student;
      }

      await onSaved(savedStudent);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const inputErrorClass = (hasErr: boolean) =>
    hasErr
      ? 'border-red-500 dark:border-red-500 focus:ring-red-500/30 focus:border-red-500'
      : undefined;

  const tabs: Array<{ id: FormTabId; label: string; icon: typeof UserCheck; errorCount: number }> = [
    {
      id: 'identity',
      label: t('students.tabIdentity'),
      icon: UserCheck,
      errorCount: tabErrorCounts.identity,
    },
    {
      id: 'academic',
      label: t('students.tabAcademic'),
      icon: BookOpen,
      errorCount: tabErrorCounts.academic,
    },
    {
      id: 'contacts',
      label: t('students.tabContacts'),
      icon: Phone,
      errorCount: tabErrorCounts.contacts,
    },
  ];

  const tabOrder: FormTabId[] = ['identity', 'academic', 'contacts'];
  const currentTabIndex = tabOrder.indexOf(activeTab);

  const initials = (watchedFullName || student?.fullName || 'NS')
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const displayedPhotoUrl = pendingPhotoDataUrl || resolveAssetUrl(student?.photoUrl) || '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={student ? t('students.editStudent') : t('students.registerStudent')}
      subtitle={student ? t('students.modalSubtitleEdit') : t('students.modalSubtitleCreate')}
      maxWidth="max-w-3xl"
    >
      <form
        onSubmit={handleSubmit(onValidSubmit, handleInvalidSubmit)}
        noValidate
        className="space-y-5"
      >
        {/* Segmented Form Section Navigation */}
        <div
          role="tablist"
          aria-label="Student form sections"
          className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                  isActive
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                )}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
                {tab.errorCount > 0 && (
                  <span className="font-mono tabular-nums text-red-600 dark:text-red-400 font-semibold">
                    ({tab.errorCount})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Validation Summary Banner */}
        {submitCount > 0 && totalErrorCount > 0 && (
          <div
            role="alert"
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{t('students.validationSummary', { count: totalErrorCount })}</span>
          </div>
        )}

        {/* Section 1: Identity & Demographics */}
        <div className={cn('space-y-5', activeTab !== 'identity' && 'hidden')}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3.5">
              {displayedPhotoUrl ? (
                <img
                  src={displayedPhotoUrl}
                  alt={watchedFullName || 'Student'}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                />
              ) : (
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-base font-bold text-white shrink-0"
                  style={{ backgroundColor: 'var(--brand-primary, #0F4C81)' }}
                >
                  {initials || 'NS'}
                </div>
              )}
              <div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {t('students.photoLabel')}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('students.photoHint')}
                </div>
                {photoError && <FieldError message={photoError} />}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {pendingPhotoDataUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPendingPhotoDataUrl(null);
                    setPhotoError(null);
                  }}
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{t('students.removePhoto')}</span>
                </Button>
              )}
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/70 cursor-pointer transition-colors whitespace-nowrap shrink-0">
                <Upload className="w-3.5 h-3.5" />
                <span>{t('students.uploadPhoto')}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="student-fullName">
                {t('students.fullName')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="student-fullName"
                aria-invalid={Boolean(errors.fullName)}
                className={inputErrorClass(Boolean(errors.fullName))}
                placeholder="Amina Mohamed Farah"
                {...register('fullName')}
              />
              <FieldError message={errors.fullName?.message} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="student-gender">
                  {t('students.gender')} <span className="text-red-500">*</span>
                </Label>
                <Select
                  id="student-gender"
                  aria-invalid={Boolean(errors.gender)}
                  className={inputErrorClass(Boolean(errors.gender))}
                  {...register('gender')}
                >
                  <option value="male">{t('students.male')}</option>
                  <option value="female">{t('students.female')}</option>
                </Select>
                <FieldError message={errors.gender?.message} />
              </div>

              <div>
                <Label htmlFor="student-dob">
                  {t('students.dateOfBirth')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="student-dob"
                  type="date"
                  max={TODAY_ISO}
                  aria-invalid={Boolean(errors.dateOfBirth)}
                  className={cn('font-mono tabular-nums', inputErrorClass(Boolean(errors.dateOfBirth)))}
                  {...register('dateOfBirth')}
                />
                <FieldError message={errors.dateOfBirth?.message} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="student-id">{t('students.studentId')}</Label>
              <Input
                id="student-id"
                aria-invalid={Boolean(errors.studentId)}
                placeholder={t('students.autoGeneratedHint')}
                className={cn('font-mono uppercase', inputErrorClass(Boolean(errors.studentId)))}
                {...register('studentId')}
              />
              <FieldError message={errors.studentId?.message} />
            </div>

            <div>
              <Label htmlFor="student-admission-no">{t('students.admissionNumber')}</Label>
              <Input
                id="student-admission-no"
                aria-invalid={Boolean(errors.admissionNumber)}
                placeholder={t('students.autoGeneratedHint')}
                className={cn(
                  'font-mono uppercase',
                  inputErrorClass(Boolean(errors.admissionNumber))
                )}
                {...register('admissionNumber')}
              />
              <FieldError message={errors.admissionNumber?.message} />
            </div>

            <div>
              <Label htmlFor="student-nationality">{t('students.nationality')}</Label>
              <Input
                id="student-nationality"
                aria-invalid={Boolean(errors.nationality)}
                className={inputErrorClass(Boolean(errors.nationality))}
                {...register('nationality')}
              />
              <FieldError message={errors.nationality?.message} />
            </div>
          </div>
        </div>

        {/* Section 2: Academic Records */}
        <div className={cn('space-y-5', activeTab !== 'academic' && 'hidden')}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('students.academicSection')}
            </h3>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {t('students.classPreviewLabel')}:{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {watchedGrade} - {(watchedSection || 'A').toUpperCase()}
              </span>{' '}
              · {watchedDivision} · {watchedYear}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="student-division">
                {t('students.division')} <span className="text-red-500">*</span>
              </Label>
              <Select
                id="student-division"
                aria-invalid={Boolean(errors.division)}
                className={inputErrorClass(Boolean(errors.division))}
                {...register('division')}
                onChange={(e) => {
                  const div = e.target.value as 'Primary' | 'Secondary';
                  setValue('division', div, { shouldValidate: true });
                  setValue('gradeLevel', div === 'Primary' ? 'Grade 1' : 'Form 1', {
                    shouldValidate: true,
                  });
                }}
              >
                <option value="Primary">{t('students.primaryDivision')}</option>
                <option value="Secondary">{t('students.secondaryDivision')}</option>
              </Select>
              <FieldError message={errors.division?.message} />
            </div>

            <div>
              <Label htmlFor="student-gradeLevel">
                {t('students.gradeLevel')} <span className="text-red-500">*</span>
              </Label>
              <Select
                id="student-gradeLevel"
                aria-invalid={Boolean(errors.gradeLevel)}
                className={inputErrorClass(Boolean(errors.gradeLevel))}
                {...register('gradeLevel')}
              >
                {(watchedDivision === 'Secondary' ? SECONDARY_GRADES : PRIMARY_GRADES).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
              <FieldError message={errors.gradeLevel?.message} />
            </div>

            <div>
              <Label htmlFor="student-section">
                {t('students.section')} <span className="text-red-500">*</span>
              </Label>
              <Select
                id="student-section"
                aria-invalid={Boolean(errors.section)}
                className={inputErrorClass(Boolean(errors.section))}
                {...register('section')}
              >
                {SECTIONS.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </Select>
              <FieldError message={errors.section?.message} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="student-academicYear">
                {t('students.academicYear')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="student-academicYear"
                placeholder="2026-2027"
                aria-invalid={Boolean(errors.academicYear)}
                className={cn('font-mono tabular-nums', inputErrorClass(Boolean(errors.academicYear)))}
                {...register('academicYear')}
              />
              <FieldError message={errors.academicYear?.message} />
            </div>

            <div>
              <Label htmlFor="student-admissionDate">
                {t('students.admissionDate')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="student-admissionDate"
                type="date"
                aria-invalid={Boolean(errors.admissionDate)}
                className={cn('font-mono tabular-nums', inputErrorClass(Boolean(errors.admissionDate)))}
                {...register('admissionDate')}
              />
              <FieldError message={errors.admissionDate?.message} />
            </div>

            <div>
              <Label htmlFor="student-status">
                {t('common.status')} <span className="text-red-500">*</span>
              </Label>
              <Select
                id="student-status"
                aria-invalid={Boolean(errors.status)}
                className={inputErrorClass(Boolean(errors.status))}
                {...register('status')}
              >
                <option value="active">{t('students.statusActive')}</option>
                <option value="applicant">{t('students.statusApplicant')}</option>
                <option value="transferred">{t('students.statusTransferred')}</option>
                <option value="graduated">{t('students.statusGraduated')}</option>
                <option value="archived">{t('students.statusArchived')}</option>
              </Select>
              <FieldError message={errors.status?.message} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div>
              <Label htmlFor="student-previousSchool">{t('students.previousSchool')}</Label>
              <Input
                id="student-previousSchool"
                aria-invalid={Boolean(errors.previousSchool)}
                className={inputErrorClass(Boolean(errors.previousSchool))}
                {...register('previousSchool')}
              />
              <FieldError message={errors.previousSchool?.message} />
            </div>

            <div>
              <Label htmlFor="student-medicalNotes">{t('students.medicalNotes')}</Label>
              <Input
                id="student-medicalNotes"
                placeholder={t('students.medicalNotesPlaceholder')}
                aria-invalid={Boolean(errors.medicalNotes)}
                className={inputErrorClass(Boolean(errors.medicalNotes))}
                {...register('medicalNotes')}
              />
              <FieldError message={errors.medicalNotes?.message} />
            </div>
          </div>
        </div>

        {/* Section 3: Contact Details, Guardian & Emergency Contact */}
        <div className={cn('space-y-5', activeTab !== 'contacts' && 'hidden')}>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('students.studentContactSection')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="student-phone">{t('students.phone')}</Label>
                <Input
                  id="student-phone"
                  placeholder="+252 61 5001122"
                  aria-invalid={Boolean(errors.phone)}
                  className={cn('font-mono', inputErrorClass(Boolean(errors.phone)))}
                  {...register('phone')}
                />
                <FieldError message={errors.phone?.message} />
              </div>

              <div>
                <Label htmlFor="student-email">{t('students.email')}</Label>
                <Input
                  id="student-email"
                  type="email"
                  placeholder="student@somalischool.edu.so"
                  aria-invalid={Boolean(errors.email)}
                  className={inputErrorClass(Boolean(errors.email))}
                  {...register('email')}
                />
                <FieldError message={errors.email?.message} />
              </div>

              <div>
                <Label htmlFor="student-address">{t('students.address')}</Label>
                <Input
                  id="student-address"
                  aria-invalid={Boolean(errors.address)}
                  className={inputErrorClass(Boolean(errors.address))}
                  {...register('address')}
                />
                <FieldError message={errors.address?.message} />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('students.guardianSection')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="guardian-fullName">
                  {t('students.guardianName')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="guardian-fullName"
                  aria-invalid={Boolean(errors.guardianFullName)}
                  className={inputErrorClass(Boolean(errors.guardianFullName))}
                  {...register('guardianFullName')}
                />
                <FieldError message={errors.guardianFullName?.message} />
              </div>

              <div>
                <Label htmlFor="guardian-relationship">
                  {t('students.guardianRelationship')} <span className="text-red-500">*</span>
                </Label>
                <Select
                  id="guardian-relationship"
                  aria-invalid={Boolean(errors.guardianRelationship)}
                  className={inputErrorClass(Boolean(errors.guardianRelationship))}
                  {...register('guardianRelationship')}
                >
                  <option value="Father">{t('students.relationshipFather')}</option>
                  <option value="Mother">{t('students.relationshipMother')}</option>
                  <option value="Uncle">{t('students.relationshipUncle')}</option>
                  <option value="Aunt">{t('students.relationshipAunt')}</option>
                  <option value="Sibling">{t('students.relationshipSibling')}</option>
                  <option value="Legal Guardian">{t('students.relationshipGuardian')}</option>
                  {student?.guardian?.relationship &&
                    ![
                      'Father',
                      'Mother',
                      'Uncle',
                      'Aunt',
                      'Sibling',
                      'Legal Guardian',
                    ].includes(student.guardian.relationship) && (
                      <option value={student.guardian.relationship}>
                        {student.guardian.relationship}
                      </option>
                    )}
                </Select>
                <FieldError message={errors.guardianRelationship?.message} />
              </div>

              <div>
                <Label htmlFor="guardian-phone">
                  {t('students.guardianPhone')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="guardian-phone"
                  placeholder="+252 61 5002233"
                  aria-invalid={Boolean(errors.guardianPhone)}
                  className={cn('font-mono', inputErrorClass(Boolean(errors.guardianPhone)))}
                  {...register('guardianPhone')}
                />
                <FieldError message={errors.guardianPhone?.message} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="guardian-email">{t('students.guardianEmail')}</Label>
                <Input
                  id="guardian-email"
                  type="email"
                  aria-invalid={Boolean(errors.guardianEmail)}
                  className={inputErrorClass(Boolean(errors.guardianEmail))}
                  {...register('guardianEmail')}
                />
                <FieldError message={errors.guardianEmail?.message} />
              </div>

              <div>
                <Label htmlFor="guardian-occupation">{t('students.guardianOccupation')}</Label>
                <Input
                  id="guardian-occupation"
                  aria-invalid={Boolean(errors.guardianOccupation)}
                  className={inputErrorClass(Boolean(errors.guardianOccupation))}
                  {...register('guardianOccupation')}
                />
                <FieldError message={errors.guardianOccupation?.message} />
              </div>

              <div>
                <Label htmlFor="guardian-address">{t('students.guardianAddress')}</Label>
                <Input
                  id="guardian-address"
                  aria-invalid={Boolean(errors.guardianAddress)}
                  className={inputErrorClass(Boolean(errors.guardianAddress))}
                  {...register('guardianAddress')}
                />
                <FieldError message={errors.guardianAddress?.message} />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('students.emergencySection')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="emergency-fullName">{t('students.emergencyName')}</Label>
                <Input
                  id="emergency-fullName"
                  aria-invalid={Boolean(errors.emergencyFullName)}
                  className={inputErrorClass(Boolean(errors.emergencyFullName))}
                  {...register('emergencyFullName')}
                />
                <FieldError message={errors.emergencyFullName?.message} />
              </div>

              <div>
                <Label htmlFor="emergency-relationship">
                  {t('students.emergencyRelationship')}
                </Label>
                <Input
                  id="emergency-relationship"
                  aria-invalid={Boolean(errors.emergencyRelationship)}
                  className={inputErrorClass(Boolean(errors.emergencyRelationship))}
                  {...register('emergencyRelationship')}
                />
                <FieldError message={errors.emergencyRelationship?.message} />
              </div>

              <div>
                <Label htmlFor="emergency-phone">{t('students.emergencyPhone')}</Label>
                <Input
                  id="emergency-phone"
                  placeholder="+252 61..."
                  aria-invalid={Boolean(errors.emergencyPhone)}
                  className={cn('font-mono', inputErrorClass(Boolean(errors.emergencyPhone)))}
                  {...register('emergencyPhone')}
                />
                <FieldError message={errors.emergencyPhone?.message} />
              </div>
            </div>
          </div>
        </div>

        {submitError && (
          <div
            role="alert"
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Footer Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            {currentTabIndex > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setActiveTab(tabOrder[currentTabIndex - 1])}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>{t('students.prevStep')}</span>
              </Button>
            )}
            {currentTabIndex < tabOrder.length - 1 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setActiveTab(tabOrder[currentTabIndex + 1])}
              >
                <span>{t('students.nextStep')}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? t('common.saving')
                : student
                  ? t('students.saveChangesSubmit')
                  : t('students.registerSubmit')}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
