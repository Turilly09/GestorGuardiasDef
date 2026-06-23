import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, updateDoc, doc, query, orderBy, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Guardia, Teacher, TurnConfig } from '../types';
import { Button } from './ui/Button';
import { format, parseISO, isSameWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { Users, CheckCircle2, Clock, ChevronDown } from 'lucide-react';

export function GuardiasBoard() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [guardias, setGuardias] = useState<Guardia[]>([]);
  const [turns, setTurns] = useState<TurnConfig[]>([]);
  const [now, setNow] = useState(new Date());
  const [viewFilter, setViewFilter] = useState<'current' | 'today' | 'week'>('current');

  // Assignment state
  const [assigningGuardiaId, setAssigningGuardiaId] = useState<string | null>(null);
  const [selectedSubstituteId, setSelectedSubstituteId] = useState<string>('');

  useEffect(() => {
    const unsubTeachers = onSnapshot(collection(db, 'teachers'), (snap) => {
      setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Teacher)));
    });

    const q = query(collection(db, 'guardias'));
    const unsubGuardias = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Guardia));
      docs.sort((a, b) => {
        if (a.dateStr === b.dateStr) return Number(a.period) - Number(b.period);
        return b.dateStr.localeCompare(a.dateStr);
      });
      setGuardias(docs);
    }, (error) => {
      console.error("Error fetching guardias:", error);
    });

    const unsubConfig = onSnapshot(doc(db, 'config', 'general'), (snap) => {
      if (snap.exists() && snap.data().turns) {
        setTurns(snap.data().turns);
      }
    });

    const timer = setInterval(() => setNow(new Date()), 60000);

    return () => { unsubTeachers(); unsubGuardias(); unsubConfig(); clearInterval(timer); };
  }, []);

  const getCurrentPeriod = () => {
    const currentTimeStr = format(now, 'HH:mm');
    for (const t of turns) {
      if (currentTimeStr >= t.startTime && currentTimeStr <= t.endTime) {
        return t.period;
      }
    }
    return null;
  };

  const currentPeriod = getCurrentPeriod();
  const todayStr = format(now, 'yyyy-MM-dd');

  const filteredGuardias = guardias.filter(g => {
    const guardiaDate = parseISO(g.dateStr);
    if (viewFilter === 'current') {
      return g.dateStr === todayStr && Number(g.period) === Number(currentPeriod);
    }
    if (viewFilter === 'today') {
      return g.dateStr === todayStr;
    }
    if (viewFilter === 'week') {
      return isSameWeek(guardiaDate, now, { weekStartsOn: 1 });
    }
    return true;
  });

  const startAssigning = (guardiaId: string) => {
    setAssigningGuardiaId(guardiaId);
    setSelectedSubstituteId('');
  };

  const confirmAssignment = async (guardiaId: string) => {
    if (!selectedSubstituteId) {
      alert("Selecciona un docente para la sustitución.");
      return;
    }
    try {
      await updateDoc(doc(db, 'guardias', guardiaId), {
        substituteTeacherId: selectedSubstituteId,
        status: 'assigned'
      });
      setAssigningGuardiaId(null);

      if (selectedSubstituteId !== 'aula-libre') {
        const substitute = teachers.find(t => t.id === selectedSubstituteId);
        const guardia = guardias.find(g => g.id === guardiaId);
        if (substitute?.email && guardia) {
          const dateStrFormat = format(parseISO(guardia.dateStr), 'dd/MM/yyyy');
          const absentName = teachers.find(t => t.id === guardia.absentTeacherId)?.name || 'Desconocido';
          try {
            await addDoc(collection(db, 'mail'), {
              to: substitute.email,
              message: {
                subject: `Asignación de Guardia - ${dateStrFormat} (Turno ${guardia.period})`,
                html: `
                  <h3>Nueva guardia asignada</h3>
                  <p>Hola, <strong>${substitute.name}</strong>,</p>
                  <p>Se te ha asignado una guardia para el d&iacute;a <strong>${dateStrFormat}</strong> en el <strong>turno ${guardia.period}</strong>.</p>
                  <ul>
                    <li><strong>Grupo/Clase:</strong> ${guardia.group}</li>
                    <li><strong>Asignatura:</strong> ${guardia.subject || 'N/A'}</li>
                    <li><strong>Docente ausente:</strong> ${absentName}</li>
                  </ul>
                  <p><strong>Tarea indicada:</strong><br/>${guardia.task?.replace(/\n/g, '<br/>') || 'Sin especificar'}</p>
                `
              }
            });
          } catch (e) {
             console.error("Error writing to mail collection:", e);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const cancelGuardia = async (guardiaId: string) => {
    if (confirm("¿Liberar la guardia?")) {
      await updateDoc(doc(db, 'guardias', guardiaId), {
        substituteTeacherId: null,
        status: 'pending'
      });
    }
  };

  const todayDayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
  const dayNames: Record<number, string> = {
    1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes'
  };

  const statsGroups: { day: number, period: number, teachers: (Teacher & { count: number })[] }[] = [];
  const daysToInclude = viewFilter === 'week' ? [1, 2, 3, 4, 5] : [todayDayOfWeek];
  
  daysToInclude.forEach(d => {
    if (d > 5) return; // Only Mon-Fri
    const periodsToInclude = viewFilter === 'current' ? (currentPeriod ? [currentPeriod] : []) : [1, 2, 3, 4, 5, 6];
    
    periodsToInclude.forEach(p => {
      const availableTeachers = teachers.filter(t => 
        (t.availability || []).some(a => Number(a.dayOfWeek) === Number(d) && Number(a.period) === Number(p))
      );
      
      if (availableTeachers.length > 0) {
        const teachersWithStats = availableTeachers.map(t => {
           // Use only the filtered guardias so it matches the Selected View Filter (Current, Today, Week)
           const count = guardias.filter(g => g.status === 'assigned' && g.substituteTeacherId === t.id && Number(g.period) === Number(p)).length;
           return { ...t, count };
        }).sort((a, b) => a.count - b.count); // Ascending: less guardias first
        
        statsGroups.push({ day: d, period: p, teachers: teachersWithStats });
      }
    });
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
      
      {/* Right Column (now Left): Guardias List */}
      <div className="lg:col-span-2 space-y-4 order-2 lg:order-1">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-500" />
            {viewFilter === 'current' ? `Guardias (Turno ${currentPeriod || 'Fuera de Horario'})` : 
             viewFilter === 'today' ? 'Guardias de Hoy' : 'Guardias de la Semana'}
          </h2>
          <div className="flex bg-slate-200 rounded-lg p-1 self-stretch sm:self-auto overflow-x-auto">
            <button 
              onClick={() => setViewFilter('current')} 
              className={`whitespace-nowrap flex-1 sm:flex-none px-3 py-1.5 text-sm rounded-md transition-colors ${viewFilter === 'current' ? 'bg-white shadow text-indigo-700 font-medium' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Turno Actual
            </button>
            <button 
              onClick={() => setViewFilter('today')} 
              className={`whitespace-nowrap flex-1 sm:flex-none px-3 py-1.5 text-sm rounded-md transition-colors ${viewFilter === 'today' ? 'bg-white shadow text-indigo-700 font-medium' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Hoy
            </button>
            <button 
              onClick={() => setViewFilter('week')} 
              className={`whitespace-nowrap flex-1 sm:flex-none px-3 py-1.5 text-sm rounded-md transition-colors ${viewFilter === 'week' ? 'bg-white shadow text-indigo-700 font-medium' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Semana
            </button>
          </div>
        </div>
        
        {filteredGuardias.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-xl border border-slate-200 border-dashed">
             <p className="text-slate-500">No hay guardias para mostrar con este filtro.</p>
          </div>
        ) : viewFilter === 'week' ? (
          <div className="space-y-4">
            {Array.from(new Set<string>(filteredGuardias.map(g => g.dateStr))).sort().map(dateStr => {
              const dayGuardias = filteredGuardias.filter(g => g.dateStr === dateStr);
              dayGuardias.sort((a, b) => Number(a.period) - Number(b.period));
              const pendingCount = dayGuardias.filter(g => g.status === 'pending').length;
              
              return (
                <details key={dateStr} className="group bg-white rounded-xl border border-slate-200 shadow-sm" open={dateStr === format(now, 'yyyy-MM-dd') || pendingCount > 0}>
                  <summary className="p-4 bg-slate-50 font-semibold cursor-pointer select-none flex justify-between items-center group-open:border-b border-slate-200 hover:bg-slate-100 transition-colors [&::-webkit-details-marker]:hidden list-none">
                    <div className="flex items-center gap-3">
                      <ChevronDown className="w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform" />
                      <span className="capitalize text-slate-800">{format(parseISO(dateStr), 'EEEE d MMMM', { locale: es })}</span>
                    </div>
                    <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${pendingCount > 0 ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-700'}`}>
                       {dayGuardias.length} guardia{dayGuardias.length !== 1 ? 's' : ''} {pendingCount > 0 && `(${pendingCount} pend.)`}
                    </span>
                  </summary>
                  <div className="p-0 overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-white text-slate-500 border-b border-slate-100 text-xs uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-3 font-medium">Turno</th>
                          <th className="px-4 py-3 font-medium">Grupo</th>
                          <th className="px-4 py-3 font-medium">Docente Ausente</th>
                          <th className="px-4 py-3 font-medium">Guardia / Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {dayGuardias.map(g => {
                          const absent = teachers.find(t => t.id === g.absentTeacherId)?.name || 'Desconocido';
                          const substitute = g.substituteTeacherId === 'aula-libre' ? 'Aula libre' : (teachers.find(t => t.id === g.substituteTeacherId)?.name || (g.status === 'pending' ? '---' : 'Desconocido'));
                          const isPending = g.status === 'pending';
                          
                          return (
                            <tr key={g.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 text-slate-500 font-medium">{g.period}</td>
                              <td className="px-4 py-3 font-medium text-slate-900">{g.group}</td>
                              <td className="px-4 py-3 text-slate-600 truncate max-w-[200px]" title={absent}>{absent}</td>
                              <td className="px-4 py-3 text-slate-600">
                                {isPending ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                                    Pendiente
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                     <CheckCircle2 className="w-3 h-3 mr-1" />
                                     {substitute}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(new Set<string>(filteredGuardias.map(g => `${g.dateStr}|${g.period}`))).map(groupKey => {
              const [dateStr, periodStr] = groupKey.split('|');
              const periodNum = parseInt(periodStr);
              const groupGuardias = filteredGuardias.filter(g => g.dateStr === dateStr && Number(g.period) === periodNum);
              
              const pendingCount = groupGuardias.filter(g => g.status === 'pending').length;
              return (
                <details key={groupKey} className="group bg-white rounded-xl border border-slate-200 shadow-sm space-y-0" open={pendingCount > 0 || viewFilter === 'current' || viewFilter === 'today'}>
                  <summary className="p-4 bg-slate-50 font-semibold cursor-pointer select-none flex justify-between items-center group-open:border-b border-slate-200 hover:bg-slate-100 transition-colors rounded-xl group-open:rounded-b-none [&::-webkit-details-marker]:hidden list-none">
                    <div className="flex items-center gap-3">
                      <ChevronDown className="w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform" />
                      <span className="capitalize text-slate-800 font-bold">
                        {format(parseISO(dateStr), 'EEEE d MMMM', { locale: es })} • Turno {periodNum}
                      </span>
                    </div>
                    <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${pendingCount > 0 ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-700'}`}>
                       {groupGuardias.length} guardia{groupGuardias.length !== 1 ? 's' : ''} {pendingCount > 0 && `(${pendingCount} pend.)`}
                    </span>
                  </summary>
                  <div className="p-4 grid gap-4 bg-slate-50/50 rounded-b-xl">
                    {groupGuardias.map(g => {
                      const absent = teachers.find(t => t.id === g.absentTeacherId)?.name || 'Desconocido';
                      const substitute = g.substituteTeacherId === 'aula-libre' ? 'Aula libre' : (teachers.find(t => t.id === g.substituteTeacherId)?.name || 'Desconocido');
                      const isPending = g.status === 'pending';
                      const dayOfWeek = parseISO(g.dateStr).getDay();
                      
                      return (
                        <div key={g.id} className={`p-5 rounded-xl border transition-all ${isPending ? 'bg-white border-orange-200 shadow-sm' : 'bg-slate-50 border-slate-200'}`}>
                          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                            <div>
                              <div className="flex flex-wrap items-center gap-3 mb-2">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isPending ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                                  {isPending ? 'Pendiente' : 'Cubierta'}
                                </span>
                              </div>
                              <h3 className="text-lg font-bold text-slate-900">
                                {g.group} {g.subject && <span className="text-sm font-normal text-slate-500 ml-2">• {g.subject}</span>}
                              </h3>
                              <p className="text-sm text-slate-600 mt-1">Ausente: <span className="font-medium text-slate-900">{absent}</span></p>
                              {g.task && <p className="text-sm text-slate-600 bg-white/50 p-3 rounded-lg mt-3 border border-slate-100">Tarea: {g.task}</p>}
                            </div>
                            
                            <div className="text-right w-full sm:w-auto">
                              {isPending ? (
                                assigningGuardiaId === g.id ? (
                                  <div className="flex flex-col gap-2 items-end w-full">
                                    <select 
                                      className="w-full sm:w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                                      value={selectedSubstituteId}
                                      onChange={(e) => setSelectedSubstituteId(e.target.value)}
                                    >
                                      <option value="">Seleccionar Docente...</option>
                                      <optgroup label="Opciones Especiales">
                                        <option value="aula-libre">Aula Libre (Sin Alumnos)</option>
                                      </optgroup>
                                      <optgroup label="Disponibles en este turno">
                                        {teachers
                                          .filter(t => t.active !== false)
                                          .filter(t => {
                                            const dayRaw = parseISO(g.dateStr).getDay();
                                            const adjustedGDay = dayRaw === 0 ? 7 : dayRaw;
                                            return (t.availability || []).some(a => Number(a.dayOfWeek) === adjustedGDay && Number(a.period) === Number(g.period));
                                          })
                                          .map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                                        }
                                      </optgroup>
                                    </select>
                                    <div className="flex gap-2 w-full sm:w-auto justify-end">
                                      <button onClick={() => setAssigningGuardiaId(null)} className="text-sm text-slate-500 hover:text-slate-700 font-medium px-2 py-1">Cancelar</button>
                                      <button onClick={() => confirmAssignment(g.id!)} className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium transition-colors">Confirmar</button>
                                    </div>
                                  </div>
                                ) : (
                                  <Button onClick={() => startAssigning(g.id!)} className="bg-orange-600 hover:bg-orange-700 text-white w-full sm:w-auto">
                                    Asignar Guardia
                                  </Button>
                                )
                              ) : (
                                 <div className="flex flex-col items-end gap-2 w-full">
                                   <div className="flex items-center gap-1.5 text-green-700 font-medium text-sm bg-green-50 px-3 py-1.5 rounded-lg border border-green-100">
                                     <CheckCircle2 className="h-4 w-4" />
                                     {substitute}
                                   </div>
                                   <button onClick={() => cancelGuardia(g.id!)} className="text-xs text-slate-400 hover:text-slate-600 underline">
                                     Liberar Guardia
                                   </button>
                                 </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>

      {/* Left Column (now Right): Stats */}
      <div className="space-y-8 order-1 lg:order-2">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 sticky top-24">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-indigo-600" />
            Balance de Guardias
          </h2>
          <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
            {statsGroups.length > 0 ? (
              Array.from(new Set(statsGroups.map(g => g.day))).sort().map(day => {
                const dayPeriods = statsGroups.filter(g => g.day === day).sort((a, b) => a.period - b.period);
                
                return (
                  <details key={`day-${day}`} className="group/day bg-white rounded-xl border border-slate-200 shadow-sm" open={viewFilter === 'current' || viewFilter === 'today'}>
                    <summary className="p-3 bg-slate-50 font-semibold cursor-pointer select-none flex justify-between items-center group-open/day:border-b border-slate-200 hover:bg-slate-100 transition-colors [&::-webkit-details-marker]:hidden list-none rounded-xl group-open/day:rounded-b-none">
                      <div className="flex items-center gap-2">
                        <ChevronDown className="w-4 h-4 text-slate-400 group-open/day:rotate-180 transition-transform" />
                        <span className="text-sm font-bold text-slate-800 uppercase tracking-wider">{dayNames[day]}</span>
                      </div>
                    </summary>
                    <div className="p-3 space-y-3 bg-white rounded-b-xl">
                      {dayPeriods.map(group => (
                        <details key={`${group.day}-${group.period}`} className="group/period bg-slate-50 rounded-lg border border-slate-100 shadow-sm" open={viewFilter === 'current' || viewFilter === 'today'}>
                          <summary className="p-2.5 font-semibold cursor-pointer select-none flex justify-between items-center group-open/period:border-b border-slate-200 hover:bg-slate-100 transition-colors [&::-webkit-details-marker]:hidden list-none">
                            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-open/period:rotate-180 transition-transform" />
                              Turno {group.period}
                            </div>
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                              {group.teachers.length} disp.
                            </span>
                          </summary>
                          <div className="p-2.5 space-y-2 bg-white rounded-b-lg">
                            {group.teachers.map(t => (
                              <div key={t.id} className="flex items-center justify-between group/item">
                                <span className="text-sm font-medium text-slate-700 truncate mr-2 group-hover/item:text-indigo-600 transition-colors cursor-default" title={t.name}>{t.name}</span>
                                <span className="inline-flex items-center justify-center bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 border border-indigo-100" title={`${t.count} guardias realizadas en este turno`}>
                                  {t.count}
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                );
              })
            ) : (
              <p className="text-sm text-slate-500">No hay docentes disponibles con este filtro.</p>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
