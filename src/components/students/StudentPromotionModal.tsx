import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ALL_GRADES, SECTIONS } from './StudentFormModal';
import { Button, Input, Label, Modal, Select } from '../ui/Primitives';
import { apiRequest } from '../../services/api';
import type {
  AcademicResultOutcome,
  PromoteStudentsResponse,
  PromotionCandidate,
  PromotionPreviewResponse,
} from '../../types/nexus';
import { cn } from '../../utils/cn';

interface StudentPromotionModalProps {
  open: boolean;
  onClose: () => void;
  availableAcademicYears: string[];
  onPromoted: () => void | Promise<void>;
}

function getCurrentAcademicYear(): string {
  const y = new Date().getFullYear();
  return `${y}-${y + 1}`;
}

function getNextAcademicYear(sourceYear: string): string {
  const match = /^(\d{4})-(\d{4})$/.exec(sourceYear.trim());
  if (match) {
    const nextStart = Number(match[1]) + 1;
    return `${nextStart}-${nextStart + 1}`;
  }
  const y = new Date().getFullYear() + 1;
  return `${y}-${y + 1}`;
}

export function StudentPromotionModal({
  open,
  onClose,
  availableAcademicYears,
  onPromoted,
}: StudentPromotionModalProps) {
  const { t } = useTranslation();

  const defaultSourceYear = availableAcademicYears[0] || getCurrentAcademicYear();
  const [sourceYear, setSourceYear] = useState(defaultSourceYear);
  const [targetYear, setTargetYear] = useState(getNextAcademicYear(defaultSourceYear));
  const [gradeFilter, setGradeFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [targetSection, setTargetSection] = useState('');
  const [skipRetained, setSkipRetained] = useState(true);
  const [note, setNote] = useState('');

  const [preview, setPreview] = useState<PromotionPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [processingResults, setProcessingResults] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draftScores, setDraftScores] = useState<
    Record<string, { averageScore: number; outcome: AcademicResultOutcome }>
  >({});

  const yearOptions = useMemo(() => {
    const set = new Set<string>([getCurrentAcademicYear(), ...availableAcademicYears]);
    return Array.from(set).sort();
  }, [availableAcademicYears]);

  const loadPreview = async () => {
    if (!sourceYear) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        sourceAcademicYear: sourceYear,
        targetAcademicYear: targetYear,
      });
      if (gradeFilter) params.set('sourceGradeLevel', gradeFilter);
      if (sectionFilter) params.set('sourceSection', sectionFilter);

      const res = await apiRequest<PromotionPreviewResponse>(
        `/api/students/promotion/preview?${params.toString()}`
      );
      setPreview(res);

      const nextDrafts: Record<string, { averageScore: number; outcome: AcademicResultOutcome }> =
        {};
      for (const c of res.candidates) {
        nextDrafts[c.studentId] = {
          averageScore: c.result?.averageScore ?? 78,
          outcome: c.result?.outcome ?? 'passed',
        };
      }
      setDraftScores(nextDrafts);
      setSelectedIds(
        res.candidates
          .filter(
            (c) =>
              c.readiness === 'ready_promote' ||
              c.readiness === 'ready_graduate' ||
              (!skipRetained && c.readiness === 'retained')
          )
          .map((c) => c.studentId)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSuccessMsg(null);
      setError(null);
      loadPreview();
    }
  }, [open, sourceYear, targetYear, gradeFilter, sectionFilter]);

  const candidates = preview?.candidates || [];
  const pendingCandidates = candidates.filter((c) => c.readiness === 'missing_results');

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllReady = () => {
    setSelectedIds(
      candidates
        .filter((c) => c.readiness === 'ready_promote' || c.readiness === 'ready_graduate')
        .map((c) => c.studentId)
    );
  };

  const handleProcessPendingResults = async () => {
    if (pendingCandidates.length === 0) return;
    setProcessingResults(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const entries = pendingCandidates.map((c) => {
        const draft = draftScores[c.studentId] || { averageScore: 78, outcome: 'passed' };
        return {
          studentId: c.studentId,
          averageScore: Number(draft.averageScore) || 0,
          outcome: draft.outcome,
          status: 'processed' as const,
          remarks: 'Year-end evaluation finalized',
        };
      });

      await apiRequest('/api/students/results/process', {
        method: 'POST',
        body: JSON.stringify({
          academicYear: sourceYear,
          term: 'Final',
          entries,
        }),
      });

      await loadPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setProcessingResults(false);
    }
  };

  const handleExecutePromotion = async () => {
    if (selectedIds.length === 0) return;
    setPromoting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiRequest<PromoteStudentsResponse>('/api/students/promote', {
        method: 'POST',
        body: JSON.stringify({
          sourceAcademicYear: sourceYear,
          targetAcademicYear: targetYear,
          sourceGradeLevel: gradeFilter,
          sourceSection: sectionFilter,
          studentIds: selectedIds,
          targetSection,
          skipRetained,
          note,
        }),
      });

      setSuccessMsg(
        t('students.promotion.successSummary', {
          promoted: res.summary.promotedCount,
          graduated: res.summary.graduatedCount,
          retained: res.summary.retainedCount,
        })
      );
      await onPromoted();
      await loadPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setPromoting(false);
    }
  };

  const getReadinessLabel = (c: PromotionCandidate) => {
    if (c.readiness === 'ready_promote') return t('students.promotion.statusReadyPromote');
    if (c.readiness === 'ready_graduate') return t('students.promotion.statusReadyGraduate');
    if (c.readiness === 'retained') return t('students.promotion.statusRetained');
    if (c.readiness === 'unmapped_grade') return t('students.promotion.statusUnmapped');
    if (c.result?.status === 'draft') return t('students.promotion.statusDraftResult');
    return t('students.promotion.statusMissingResult');
  };

  const getReadinessColor = (readiness: PromotionCandidate['readiness']) => {
    switch (readiness) {
      case 'ready_promote':
        return 'text-emerald-700 dark:text-emerald-400';
      case 'ready_graduate':
        return 'text-sky-700 dark:text-sky-400';
      case 'retained':
        return 'text-slate-600 dark:text-slate-400';
      default:
        return 'text-amber-700 dark:text-amber-400';
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('students.promotion.modalTitle')}
      subtitle={t('students.promotion.modalSubtitle')}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-5">
        {/* Scope & Target Configuration */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label htmlFor="promo-source-year">{t('students.promotion.sourceYear')}</Label>
            <Select
              id="promo-source-year"
              value={sourceYear}
              onChange={(e) => {
                const nextSource = e.target.value;
                setSourceYear(nextSource);
                setTargetYear(getNextAcademicYear(nextSource));
              }}
              className="font-mono"
            >
              {yearOptions.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="promo-target-year">{t('students.promotion.targetYear')}</Label>
            <Input
              id="promo-target-year"
              value={targetYear}
              onChange={(e) => setTargetYear(e.target.value)}
              placeholder="2027-2028"
              className="font-mono tabular-nums"
            />
          </div>

          <div>
            <Label htmlFor="promo-grade-scope">{t('students.promotion.gradeScope')}</Label>
            <Select
              id="promo-grade-scope"
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
            >
              <option value="">{t('students.promotion.allActiveGrades')}</option>
              {ALL_GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="promo-section-scope">{t('students.promotion.sectionScope')}</Label>
            <Select
              id="promo-section-scope"
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
            >
              <option value="">{t('students.allSections')}</option>
              {SECTIONS.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Readiness Summary Bar */}
        {preview && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 py-3 border-y border-slate-200 dark:border-slate-800 text-xs">
            <div>
              <div className="text-slate-500 dark:text-slate-400">
                {t('students.promotion.totalCandidates')}
              </div>
              <div className="text-lg font-bold tabular-nums mt-0.5">
                {preview.summary.totalCandidates}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">
                {t('students.promotion.readyCount')}
              </div>
              <div className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
                {preview.summary.readyToPromote}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">
                {t('students.promotion.graduateCount')}
              </div>
              <div className="text-lg font-bold tabular-nums text-sky-700 dark:text-sky-400 mt-0.5">
                {preview.summary.readyToGraduate}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">
                {t('students.promotion.blockedCount')}
              </div>
              <div className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400 mt-0.5">
                {preview.summary.blockedUnprocessed}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">
                {t('students.promotion.retainedCount')}
              </div>
              <div className="text-lg font-bold tabular-nums text-slate-600 dark:text-slate-300 mt-0.5">
                {preview.summary.retainedCount}
              </div>
            </div>
          </div>
        )}

        {/* Unprocessed Results Validation Warning */}
        {pendingCandidates.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
              <div>
                <div className="font-semibold">{t('students.promotion.blockedBannerTitle')}</div>
                <div className="mt-0.5 text-amber-800/90 dark:text-amber-300/90">
                  {t('students.promotion.blockedBannerDesc', {
                    count: pendingCandidates.length,
                    year: sourceYear,
                  })}
                </div>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={processingResults}
              onClick={handleProcessPendingResults}
              className="shrink-0"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>
                {processingResults
                  ? t('students.promotion.processingResults')
                  : t('students.promotion.processPendingBtn')}
              </span>
            </Button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Candidate Roster & Inline Result Assignment */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="max-h-72 overflow-y-auto overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 px-3 w-8">
                    <button
                      type="button"
                      onClick={selectAllReady}
                      title={t('students.promotion.selectReadyBtn')}
                      className="text-[11px] font-medium underline hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      All
                    </button>
                  </th>
                  <th className="py-2.5 px-3">{t('students.promotion.colStudent')}</th>
                  <th className="py-2.5 px-3">{t('students.promotion.colProgression')}</th>
                  <th className="py-2.5 px-3">{t('students.promotion.colResultStatus')}</th>
                  <th className="py-2.5 px-3">{t('students.promotion.colScore')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      {t('common.loading')}
                    </td>
                  </tr>
                ) : candidates.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      {t('students.promotion.noCandidates', { year: sourceYear })}
                    </td>
                  </tr>
                ) : (
                  candidates.map((c) => {
                    const checked = selectedIds.includes(c.studentId);
                    const draft = draftScores[c.studentId] || {
                      averageScore: 78,
                      outcome: 'passed',
                    };
                    return (
                      <tr
                        key={c.studentId}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelect(c.studentId)}
                            className="rounded border-slate-300 dark:border-slate-700 cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {c.fullName}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {c.studentCode} · {c.className}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <span>{c.currentGradeLevel}</span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                            <span
                              className={
                                c.isGraduation
                                  ? 'text-sky-700 dark:text-sky-400 font-semibold'
                                  : 'text-slate-900 dark:text-slate-100 font-semibold'
                              }
                            >
                              {c.nextGradeLevel}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={cn('font-semibold', getReadinessColor(c.readiness))}>
                            {getReadinessLabel(c)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {c.readiness === 'missing_results' ? (
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={draft.averageScore}
                                onChange={(e) =>
                                  setDraftScores((prev) => ({
                                    ...prev,
                                    [c.studentId]: {
                                      ...draft,
                                      averageScore: Number(e.target.value),
                                    },
                                  }))
                                }
                                className="w-16 h-7 text-xs font-mono tabular-nums px-2"
                              />
                              <Select
                                value={draft.outcome}
                                onChange={(e) =>
                                  setDraftScores((prev) => ({
                                    ...prev,
                                    [c.studentId]: {
                                      ...draft,
                                      outcome: e.target.value as AcademicResultOutcome,
                                    },
                                  }))
                                }
                                className="h-7 text-xs px-2 w-36"
                              >
                                <option value="passed">{t('students.promotion.outcomePassed')}</option>
                                <option value="promoted_with_support">
                                  {t('students.promotion.outcomeSupport')}
                                </option>
                                <option value="retained">
                                  {t('students.promotion.outcomeRetained')}
                                </option>
                              </Select>
                            </div>
                          ) : c.result ? (
                            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                              {c.result.averageScore}% · {c.result.outcome}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Execution Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <Label htmlFor="promo-target-section">
              {t('students.promotion.targetSectionOverride')}
            </Label>
            <Select
              id="promo-target-section"
              value={targetSection}
              onChange={(e) => setTargetSection(e.target.value)}
            >
              <option value="">{t('students.promotion.keepCurrentSection')}</option>
              {SECTIONS.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="promo-note">{t('students.promotion.promotionNoteLabel')}</Label>
            <Input
              id="promo-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('students.promotion.promotionNotePlaceholder')}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={skipRetained}
            onChange={(e) => setSkipRetained(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-700"
          />
          <span>{t('students.promotion.skipRetainedLabel')}</span>
        </label>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button
            type="button"
            disabled={promoting || selectedIds.length === 0}
            onClick={handleExecutePromotion}
          >
            <GraduationCap className="w-4 h-4" />
            <span>
              {promoting
                ? t('students.promotion.executingPromotion')
                : t('students.promotion.executePromotionBtn', { count: selectedIds.length })}
            </span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
