import { AlertTriangle, CheckCircle2, Clock, Phone, UserCheck } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Label, Modal, Select } from '../ui/Primitives';
import { apiRequest } from '../../services/api';
import type { AbsenceWarning, AbsenceWarningStatus } from '../../types/nexus';
import { cn } from '../../utils/cn';

interface AbsenceFollowUpModalProps {
  warning: AbsenceWarning | null;
  onClose: () => void;
  onSaved: (updated: AbsenceWarning) => void;
}

export function AbsenceFollowUpModal({ warning, onClose, onSaved }: AbsenceFollowUpModalProps) {
  const { t } = useTranslation();

  const [actionTaken, setActionTaken] = useState('');
  const [status, setStatus] = useState<AbsenceWarningStatus>('in_progress');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!warning) return;
    setActionTaken(
      warning.subjectType === 'teacher'
        ? t('attendance.actionCalledTeacher')
        : t('attendance.actionCalledGuardian')
    );
    setStatus(warning.status === 'open' ? 'in_progress' : warning.status);
    setNote('');
    setError(null);
  }, [warning, t]);

  if (!warning) return null;

  const actionOptions = [
    t('attendance.actionCalledGuardian'),
    t('attendance.actionParentMeeting'),
    t('attendance.actionCalledTeacher'),
    t('attendance.actionMedicalVerified'),
    t('attendance.actionHomeVisit'),
    t('attendance.actionReturnedToClass'),
    t('attendance.actionHrEscalation'),
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionTaken.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiRequest<{ warning: AbsenceWarning }>(
        `/api/attendance/warnings/${warning.id}/follow-up`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status,
            actionTaken: actionTaken.trim(),
            note: note.trim(),
            resolutionSummary: status === 'resolved' || status === 'dismissed' ? note.trim() : '',
          }),
        }
      );
      onSaved(res.warning);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={Boolean(warning)}
      onClose={onClose}
      title={t('attendance.followUpModalTitle')}
      subtitle={t('attendance.followUpModalSubtitle')}
      maxWidth="max-w-xl"
    >
      <div className="space-y-5 text-sm">
        {/* Subject & Absence Streak Overview */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {warning.subjectType === 'teacher'
                  ? t('attendance.subjectTeacher')
                  : t('attendance.subjectStudent')}{' '}
                <span aria-hidden="true">·</span>{' '}
                <span className="font-mono">{warning.subjectCode}</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {warning.subjectName}
              </h3>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                {warning.subjectDetail}
              </div>
            </div>

            <div className="text-right">
              <div
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums',
                  warning.severity === 'critical'
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-amber-700 dark:text-amber-400'
                )}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{t('attendance.consecutiveDaysCount', { count: warning.consecutiveDays })}</span>
              </div>
              {warning.contactPhone && (
                <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 font-mono mt-1 block">
                  <Phone className="w-3 h-3 inline mr-1" />
                  {warning.contactPhone}
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
            <span className="font-sans font-medium text-slate-500 dark:text-slate-400 mr-2">
              {t('attendance.absentDateRange')}:
            </span>
            {warning.absentDates.join(' · ')}
          </div>
        </div>

        {/* Follow-Up Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="followup-action">{t('attendance.followUpActionLabel')}</Label>
              <Select
                id="followup-action"
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
              >
                {actionOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="followup-status">{t('attendance.followUpStatusLabel')}</Label>
              <Select
                id="followup-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as AbsenceWarningStatus)}
              >
                <option value="acknowledged">{t('attendance.statusAcknowledged')}</option>
                <option value="in_progress">{t('attendance.statusInProgress')}</option>
                <option value="resolved">{t('attendance.statusResolved')}</option>
                <option value="dismissed">{t('attendance.statusDismissed')}</option>
                <option value="open">{t('attendance.statusOpen')}</option>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="followup-note">{t('attendance.followUpNoteLabel')}</Label>
            <textarea
              id="followup-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('attendance.followUpNotePlaceholder')}
              maxLength={500}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{submitting ? t('common.saving') : t('attendance.followUpSubmitBtn')}</span>
            </Button>
          </div>
        </form>

        {/* Follow-Up Audit Trail */}
        {warning.followUpNotes && warning.followUpNotes.length > 0 && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {t('attendance.followUpHistoryTitle')}
            </h4>
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {warning.followUpNotes.map((entry) => (
                <div
                  key={entry.id}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                      {entry.actionTaken}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono tabular-nums inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                  {entry.note && (
                    <p className="text-slate-600 dark:text-slate-300">{entry.note}</p>
                  )}
                  <div className="text-[11px] text-slate-400">
                    {t('attendance.recordedByLabel', { name: entry.recordedBy })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
