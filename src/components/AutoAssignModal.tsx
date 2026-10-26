import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Guardia, Teacher } from '../types';
import { calculateAutoAssignments, AutoAssignResult } from '../lib/autoAssign';
import { Button } from './ui/Button';
import { AlertTriangle, CheckCircle2, Zap, X, ArrowRight, ShieldAlert } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface AutoAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  dateStr: string;
  guardias: Guardia[];
  teachers: Teacher[];
}

export function AutoAssignModal({
  isOpen,
  onClose,
  dateStr,
  guardias,
  teachers,
}: AutoAssignModalProps) {
  const [isApplying, setIsApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const result: AutoAssignResult = calculateAutoAssignments(dateStr, guardias, teachers);
  const formattedDate = format(parseISO(dateStr), "EEEE d 'de' MMMM", { locale: es });

  const handleApply = async () => {
    if (result.assignments.length === 0) {
      onClose();
      return;
    }

    setIsApplying(true);
    setErrorMsg(null);

    try {
      const updatePromises = result.assignments.map(item => {
        if (!item.guardia.id || !item.substituteTeacher.id) return Promise.resolve();
        return updateDoc(doc(db, 'guardias', item.guardia.id), {
          substituteTeacherId: item.substituteTeacher.id,
          status: 'assigned',
          assignedBy: 'auto',
        });
      });

      await Promise.all(updatePromises);
      setIsApplying(false);
      onClose();
    } catch (err) {
      console.error('Error applying auto-assignments:', err);
      setErrorMsg('Ocurrió un error al guardar las asignaciones. Por favor, inténtalo de nuevo.');
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Asignación Automática de Guardias
              </h2>
              <p className="text-xs text-slate-500 capitalize">
                {formattedDate}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isApplying}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {result.totalPending === 0 ? (
            <div className="text-center py-8">
              <div className="inline-flex p-3 bg-green-100 text-green-700 rounded-full mb-3">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">
                No hay guardias pendientes para hoy
              </h3>
              <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                Todas las ausencias registradas para esta fecha ya tienen sustituto asignado o no se ha reportado ninguna falta.
              </p>
            </div>
          ) : (
            <>
              {/* Resumen numérico */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-center">
                  <span className="block text-2xl font-bold text-slate-900">
                    {result.totalPending}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    Ausencias pendientes
                  </span>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl text-center">
                  <span className="block text-2xl font-bold text-indigo-700">
                    {result.totalCanAssign}
                  </span>
                  <span className="text-xs text-indigo-600 font-medium">
                    Asignables ahora
                  </span>
                </div>
                <div
                  className={`col-span-2 sm:col-span-1 p-3 rounded-xl text-center border ${
                    result.totalMissing > 0
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-green-50 border-green-200 text-green-900'
                  }`}
                >
                  <span
                    className={`block text-2xl font-bold ${
                      result.totalMissing > 0 ? 'text-amber-700' : 'text-green-700'
                    }`}
                  >
                    {result.totalMissing}
                  </span>
                  <span className="text-xs font-medium">
                    {result.totalMissing > 0 ? 'Déficit (sin profesor)' : 'Déficit de profesores'}
                  </span>
                </div>
              </div>

              {/* Alerta de Déficit */}
              {result.deficits.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                    <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
                    <span>¡Atención: Déficit de profesorado disponible!</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-amber-800">
                    {result.deficits.map(d => (
                      <p key={d.period} className="pl-7">
                        • <strong>Turno {d.period}:</strong> Hay {d.needed} ausencia{d.needed > 1 ? 's' : ''} y solo{' '}
                        {d.available} profesor{d.available !== 1 ? 'es' : ''} disponible{d.available !== 1 ? 's' : ''}.{' '}
                        <span className="underline font-medium">
                          Quedará {d.missing} guardia sin cubrir
                        </span>{' '}
                        para gestión manual de Jefatura.
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Lista de propuestas */}
              {result.assignments.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Propuesta de asignación equilibrada
                  </h4>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 max-h-60 overflow-y-auto">
                    {result.assignments.map(item => {
                      const absent =
                        teachers.find(t => t.id === item.guardia.absentTeacherId)?.name ||
                        'Docente ausente';
                      return (
                        <div
                          key={item.guardia.id}
                          className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white hover:bg-slate-50 transition-colors"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[11px]">
                                Turno {item.guardia.period}
                              </span>
                              <span className="font-semibold text-slate-800">
                                {item.guardia.group}
                              </span>
                              {item.guardia.subject && (
                                <span className="text-slate-400">• {item.guardia.subject}</span>
                              )}
                            </div>
                            <p className="text-slate-500">
                              Ausente: <span className="text-slate-700 font-medium">{absent}</span>
                            </p>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
                            <div className="text-right">
                              <span className="inline-flex items-center gap-1 font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100">
                                {item.substituteTeacher.name}
                              </span>
                              <span className="block text-[10px] text-slate-400 mt-0.5">
                                {item.periodCount} en este turno • {item.totalCount} totales
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isApplying}
            className="text-slate-600 hover:text-slate-900 text-sm"
          >
            Cancelar
          </Button>

          {result.assignments.length > 0 && (
            <Button
              onClick={handleApply}
              disabled={isApplying}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm flex items-center gap-2 shadow-sm"
            >
              <Zap className="h-4 w-4" />
              <span>
                {isApplying
                  ? 'Asignando guardias...'
                  : `Confirmar y Asignar (${result.assignments.length})`}
              </span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
