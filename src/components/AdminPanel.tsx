import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, setDoc, query, orderBy, getDoc } from 'firebase/firestore';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { Teacher, TurnConfig, Guardia } from '../types';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { UserPlus, Clock, Download, Archive, ArchiveRestore, Edit2, Check, X, AlertTriangle, LogOut } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const defaultTurns: TurnConfig[] = [
  { period: 1, startTime: '08:00', endTime: '08:55' },
  { period: 2, startTime: '08:55', endTime: '09:50' },
  { period: 3, startTime: '09:50', endTime: '10:45' },
  { period: 4, startTime: '11:15', endTime: '12:10' },
  { period: 5, startTime: '12:10', endTime: '13:05' },
  { period: 6, startTime: '13:05', endTime: '14:00' },
];

export function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [guardias, setGuardias] = useState<Guardia[]>([]);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [teacherError, setTeacherError] = useState('');
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [editingTeacherName, setEditingTeacherName] = useState('');
  const [turns, setTurns] = useState<TurnConfig[]>(defaultTurns);
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null);
  const [alertDialog, setAlertDialog] = useState<{ isOpen: boolean, message: string } | null>(null);
  
  const [admins, setAdmins] = useState<{email: string}[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');

  useEffect(() => {
    // Only subscribe to collections if authenticated, else we might get permission errors
    let unsubTeachers: () => void = () => {};
    let unsubGuardias: () => void = () => {};
    let unsubConfig: () => void = () => {};
    let unsubAdmins: () => void = () => {};

    if (isAuthenticated) {
      unsubTeachers = onSnapshot(collection(db, 'teachers'), (snap) => {
        setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Teacher)));
      });

      const qGuardias = query(collection(db, 'guardias'), orderBy('dateStr', 'desc'), orderBy('period', 'asc'));
      unsubGuardias = onSnapshot(qGuardias, (snap) => {
        setGuardias(snap.docs.map(d => ({ id: d.id, ...d.data() } as Guardia)));
      });

      unsubConfig = onSnapshot(doc(db, 'config', 'general'), (snap) => {
        if (snap.exists() && snap.data().turns) {
          setTurns(snap.data().turns);
        } else {
          setDoc(doc(db, 'config', 'general'), { turns: defaultTurns });
        }
      });
      
      unsubAdmins = onSnapshot(collection(db, 'admins'), (snap) => {
        setAdmins(snap.docs.map(d => ({ email: d.id })));
      });
    }

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (user.email === 'cebrian.andres@iesutrillas.es' || user.email === 'capivaraestudio@gmail.com') {
          setIsAuthenticated(true);
          setCurrentUser(user);
        } else {
          // Check if user is in 'admins' collection by email
          const adminDoc = await getDoc(doc(db, 'admins', user.email || 'unknown'));
          if (adminDoc.exists()) {
            setIsAuthenticated(true);
            setCurrentUser(user);
          } else {
            setIsAuthenticated(false);
            setCurrentUser(user);
          }
        }
      } else {
        setIsAuthenticated(false);
        setCurrentUser(null);
      }
      setAuthLoading(false);
    });

    return () => { unsubAuth(); unsubTeachers(); unsubGuardias(); unsubConfig(); unsubAdmins(); };
  }, [isAuthenticated]);

  const handleTurnChange = (index: number, field: 'startTime' | 'endTime', value: string) => {
    const newTurns = [...turns];
    newTurns[index] = { ...newTurns[index], [field]: value };
    setTurns(newTurns);
  };

  const saveTurns = async () => {
    await setDoc(doc(db, 'config', 'general'), { turns }, { merge: true });
    alert("Horarios guardados correctamente.");
  };

  const addTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newTeacherName.trim();
    if (!name) return;

    const exists = teachers.some(t => t.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      setTeacherError("Ya existe un docente con este nombre.");
      return;
    }

    try {
      await addDoc(collection(db, 'teachers'), {
        name,
        email: newTeacherEmail.trim(),
        availability: [],
        active: true
      });
      setNewTeacherName('');
      setNewTeacherEmail('');
      setTeacherError('');
    } catch (err) {
      console.error(err);
    }
  };

  const toggleTeacherStatus = async (teacher: Teacher) => {
    if (!teacher.id) return;
    const isDeactivating = teacher.active !== false;
    await updateDoc(doc(db, 'teachers', teacher.id), { active: !isDeactivating });
  };

  const saveTeacherName = async (teacherId: string) => {
    const name = editingTeacherName.trim();
    if (!name) return;
    
    // Check if another teacher has the same name
    const exists = teachers.some(t => t.id !== teacherId && t.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      setAlertDialog({ isOpen: true, message: "Ya existe otro docente con este nombre." });
      return;
    }

    try {
      await updateDoc(doc(db, 'teachers', teacherId), { name });
      setEditingTeacherId(null);
      setEditingTeacherName('');
    } catch (err) {
      console.error(err);
    }
  };

  const toggleAvailability = async (teacher: Teacher, day: number, period: number) => {
    if (!teacher.id) return;
    const current = teacher.availability || [];
    const exists = current.find(a => a.dayOfWeek === day && a.period === period);
    
    let newAvailability;
    if (exists) {
      newAvailability = current.filter(a => !(a.dayOfWeek === day && a.period === period));
    } else {
      if (current.length >= 3) {
        setAlertDialog({ isOpen: true, message: "Máximo 3 horas de guardia semanales permitidas." });
        return;
      }
      newAvailability = [...current, { dayOfWeek: day, period }];
    }

    try {
      await updateDoc(doc(db, 'teachers', teacher.id), { availability: newAvailability });
    } catch (err) {
      console.error(err);
    }
  };

  const resetGuardias = async () => {
    setConfirmDialog({
      isOpen: true,
      title: "Reiniciar Guardias",
      message: "🚨 ATENCIÓN: Esta acción borrará TODO el historial de guardias de forma permanente. \n\n¿Estás completamente seguro de que quieres limpiar el registro actual del curso?",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          for (const guardia of guardias) {
            if (guardia.id) {
              await deleteDoc(doc(db, 'guardias', guardia.id));
            }
          }
          setAlertDialog({ isOpen: true, message: "El historial de guardias se ha reiniciado correctamente." });
        } catch (err) {
          console.error('Error borrando guardias:', err);
          setAlertDialog({ isOpen: true, message: "Hubo un error al borrar las guardias." });
        }
      }
    });
  };

  const resetTeachers = async () => {
    setConfirmDialog({
      isOpen: true,
      title: "Reiniciar Docentes",
      message: "🚨 ATENCIÓN: Esta acción borrará a TODOS los docentes del sistema y sus horarios. \n\nEsto está pensado para usarse al inicio de un nuevo año escolar. ¿Estás seguro de continuar?",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          for (const teacher of teachers) {
            if (teacher.id) {
              await deleteDoc(doc(db, 'teachers', teacher.id));
            }
          }
          setAlertDialog({ isOpen: true, message: "El listado de docentes se ha reiniciado correctamente." });
        } catch (err) {
          console.error('Error borrando docentes:', err);
          setAlertDialog({ isOpen: true, message: "Hubo un error al borrar los docentes." });
        }
      }
    });
  };

  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newAdminEmail.trim().toLowerCase();
    if (!email) return;

    if (admins.some(a => a.email === email)) {
      setAlertDialog({ isOpen: true, message: "Este administrador ya existe." });
      return;
    }

    try {
      await setDoc(doc(db, 'admins', email), {
        addedAt: new Date().toISOString()
      });
      setNewAdminEmail('');
    } catch (err) {
      console.error("Error added admin:", err);
      setAlertDialog({ isOpen: true, message: "Error al añadir administrador." });
    }
  };

  const removeAdmin = async (email: string) => {
    try {
      await deleteDoc(doc(db, 'admins', email));
    } catch (err) {
      console.error("Error removing admin:", err);
      setAlertDialog({ isOpen: true, message: "Error al eliminar administrador." });
    }
  };

  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  const periods = [1, 2, 3, 4, 5, 6];

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // Optional: force prompt or set custom parameters
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-blocked') {
        setAlertDialog({ 
          isOpen: true, 
          message: "El navegador ha bloqueado la ventana de Google. Por favor, abre la aplicación en una pestaña nueva (icono superior derecho) o permite las ventanas emergentes." 
        });
      } else if (err.code !== 'auth/cancelled-popup-request') {
        setAlertDialog({ isOpen: true, message: "Error al iniciar sesión." });
      }
    }
  };

  if (authLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto mt-12 bg-white p-8 rounded-xl shadow-sm border border-slate-200 animate-in fade-in duration-500">
        <h2 className="text-xl font-semibold text-slate-900 mb-6 text-center">Acceso a Administración</h2>
        <div className="space-y-4">
          <p className="text-sm text-slate-500 text-center mb-4">
            Inicia sesión con una cuenta de administrador autorizada.
          </p>
          <Button onClick={handleLogin} className="w-full flex items-center justify-center gap-2">
            Iniciar sesión con Google
          </Button>
          {currentUser && !isAuthenticated && (
            <p className="text-sm text-red-500 text-center mt-4">
              La cuenta {currentUser.email} no tiene permisos de administración.
              <button className="text-indigo-600 hover:underline ml-1 block mt-2 text-center w-full" onClick={() => signOut(auth)}>Cerrar sesión y probar con otra</button>
            </p>
          )}
        </div>
      </div>
    );
  }

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Registro Global de Guardias', 14, 15);
    doc.setFontSize(10);
    doc.text(`Generado el ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 22);
    
    let currentY = 30;

    // --- 1. Resumen por Profesor y Turno ---
    doc.setFontSize(14);
    doc.text('Resumen de Guardias por Profesor', 14, currentY);
    currentY += 8;
    
    const summaryData: any[] = [];
    const allPeriods = Array.from(new Set(guardias.map(g => Number(g.period)))).sort((a: number, b: number) => a - b);
    
    // Only count completed guardias assigned to a real teacher
    const coveredGuardias = guardias.filter(g => g.status === 'assigned' && g.substituteTeacherId && g.substituteTeacherId !== 'aula-libre');
    
    teachers.forEach(teacher => {
      const teacherGuardias = coveredGuardias.filter(g => g.substituteTeacherId === teacher.id);
      if (teacherGuardias.length === 0) return; // Skip teachers with no guardias
      
      const row = [teacher.name];
      let total = 0;
      allPeriods.forEach(p => {
        const count = teacherGuardias.filter(g => Number(g.period) === p).length;
        row.push(count > 0 ? count.toString() : '-');
        total += count;
      });
      row.push(total.toString());
      summaryData.push(row);
    });

    summaryData.sort((a, b) => Number(b[b.length - 1]) - Number(a[a.length - 1])); // Sort by total descending

    const summaryHeaders = ['Profesor', ...allPeriods.map(p => `Turno ${p}`), 'Total'];
    
    if (summaryData.length > 0) {
      autoTable(doc, {
        startY: currentY,
        head: [summaryHeaders],
        body: summaryData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229] },
        didDrawPage: (data) => {
          if (data.cursor) currentY = data.cursor.y;
        }
      });
      currentY += 15;
    } else {
      doc.setFontSize(10);
      doc.text('No hay guardias cubiertas registradas.', 14, currentY);
      currentY += 15;
    }

    // --- 2. Detalles por Mes ---
    const guardiasByMonth: Record<string, Guardia[]> = {};
    guardias.forEach(g => {
      const monthKey = format(parseISO(g.dateStr), 'MMMM yyyy', { locale: es });
      const capitalizedMonthKey = monthKey.charAt(0).toUpperCase() + monthKey.slice(1);
      if (!guardiasByMonth[capitalizedMonthKey]) guardiasByMonth[capitalizedMonthKey] = [];
      guardiasByMonth[capitalizedMonthKey].push(g);
    });

    const sortedMonths = Object.keys(guardiasByMonth).sort((a, b) => {
      const dateA = parseISO(guardiasByMonth[a][0].dateStr).getTime();
      const dateB = parseISO(guardiasByMonth[b][0].dateStr).getTime();
      return dateB - dateA;
    });

    sortedMonths.forEach(month => {
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(14);
      doc.text(`Detalle - ${month}`, 14, currentY);
      currentY += 8;

      const groupGuardias = guardiasByMonth[month];
      
      const tableData = groupGuardias.map(g => {
        const absent = teachers.find(t => t.id === g.absentTeacherId)?.name || 'Desconocido';
        const substitute = g.substituteTeacherId === 'aula-libre' ? 'Aula libre' : (teachers.find(t => t.id === g.substituteTeacherId)?.name || (g.status === 'pending' ? '---' : 'Desconocido'));
        const dateStr = format(parseISO(g.dateStr), 'dd/MM/yyyy');
        return [
          dateStr,
          `Turno ${g.period}`,
          g.group,
          absent,
          substitute,
          g.status === 'pending' ? 'Pendiente' : 'Cubierta'
        ];
      });

      autoTable(doc, {
        startY: currentY,
        head: [['Fecha', 'Turno', 'Grupo', 'Docente Ausente', 'Guardia / Sustituto', 'Estado']],
        body: tableData,
        theme: 'striped',
        didDrawPage: (data) => {
          if (data.cursor) currentY = data.cursor.y;
        }
      });
      currentY += 15;
    });

    doc.save(`reporte_global_guardias_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Panel de Administración</h2>
            {currentUser && <p className="text-sm text-slate-500">Sesión iniciada como: <span className="font-medium text-slate-700">{currentUser.email}</span></p>}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button onClick={exportToPDF} variant="secondary" className="flex items-center gap-2 flex-1 sm:flex-none justify-center">
              <Download className="w-4 h-4" />
              <span>Exportar PDF</span>
            </Button>
            <Button onClick={() => signOut(auth)} variant="outline" className="flex items-center gap-2 flex-1 sm:flex-none justify-center border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700">
              <LogOut className="w-4 h-4" />
              <span>Salir</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-indigo-600" />
          Configurar Horarios de Turnos
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {turns.map((turn, i) => (
            <div key={turn.period} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-700 w-16">Turno {turn.period}</span>
              <Input type="time" value={turn.startTime} onChange={(e) => handleTurnChange(i, 'startTime', e.target.value)} className="w-auto h-8 px-2 py-1 text-sm bg-white" />
              <span className="text-slate-400">-</span>
              <Input type="time" value={turn.endTime} onChange={(e) => handleTurnChange(i, 'endTime', e.target.value)} className="w-auto h-8 px-2 py-1 text-sm bg-white" />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={saveTurns}>Guardar Horarios</Button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-indigo-600" />
          Añadir Docente
        </h2>
        <form onSubmit={addTeacher} className="flex flex-col gap-2">
          <div className="flex flex-wrap sm:flex-nowrap gap-3">
            <Input 
              value={newTeacherName} 
              onChange={e => {
                setNewTeacherName(e.target.value);
                if (teacherError) setTeacherError('');
              }} 
              placeholder="Nombre del docente..."
              className={`max-w-[200px] sm:max-w-[250px] ${teacherError ? 'border-red-500 focus:ring-red-500/20' : ''}`}
            />
            <Input
              type="email"
              value={newTeacherEmail || ''}
              onChange={e => setNewTeacherEmail(e.target.value)}
              placeholder="Correo (opcional)"
              className="max-w-[200px] sm:max-w-[250px]"
            />
            <Button type="submit">Añadir</Button>
          </div>
          {teacherError && <p className="text-sm text-red-500 font-medium">{teacherError}</p>}
        </form>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-indigo-600" />
          Cuentas de Administrador
        </h2>
        <p className="text-sm text-slate-500 mb-4">Añade los correos electrónicos de los usuarios que tendrán acceso al panel de administración (además de los administradores principales).</p>
        
        <form onSubmit={addAdmin} className="flex flex-col gap-2 mb-6">
          <div className="flex gap-3">
            <Input 
              type="email"
              value={newAdminEmail} 
              onChange={e => setNewAdminEmail(e.target.value)} 
              placeholder="Correo electrónico..."
              className="max-w-sm"
            />
            <Button type="submit" variant="secondary">Añadir Admin</Button>
          </div>
        </form>

        <div className="grid gap-2 max-w-sm">
          {admins.map(admin => (
            <div key={admin.email} className="flex justify-between items-center bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">
              <span className="text-sm font-medium text-slate-700">{admin.email}</span>
              <button onClick={() => removeAdmin(admin.email)} className="text-slate-400 hover:text-red-500 transition-colors p-1" title="Eliminar admin">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {admins.length === 0 && <p className="text-sm text-slate-400 italic">No hay administradores adicionales.</p>}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Listado de Docentes y Horarios de Guardia</h2>
          <p className="text-sm text-slate-500 mt-1">Asigna las horas de guardia (máx. 3 por semana) haciendo clic en los turnos.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-medium">
              <tr>
                <th className="px-6 py-4 border-b border-slate-200">Docente</th>
                <th className="px-6 py-4 border-b border-slate-200">Horas Asignadas</th>
                <th className="px-6 py-4 border-b border-slate-200 w-16 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {teachers.map(teacher => (
                <tr key={teacher.id} className={`group hover:bg-slate-50 transition-colors ${teacher.active === false ? 'opacity-60 bg-slate-50' : ''}`}>
                  <td className="px-6 py-4 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      {editingTeacherId === teacher.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            autoFocus
                            value={editingTeacherName}
                            onChange={(e) => setEditingTeacherName(e.target.value)}
                            className="h-8 max-w-[200px]"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveTeacherName(teacher.id!);
                              if (e.key === 'Escape') setEditingTeacherId(null);
                            }}
                          />
                          <button onClick={() => saveTeacherName(teacher.id!)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingTeacherId(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span>{teacher.name}</span>
                          {teacher.active !== false && (
                            <button
                              onClick={() => {
                                setEditingTeacherId(teacher.id!);
                                setEditingTeacherName(teacher.name);
                              }}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Editar nombre"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {teacher.active === false && <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold uppercase tracking-wider">Inactivo</span>}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-4">
                      {days.map((day, dIdx) => (
                        <div key={day} className="flex flex-col items-center gap-1">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{day.slice(0,3)}</span>
                          <div className="flex flex-wrap gap-1 max-w-[80px] justify-center">
                            {periods.map(p => {
                              const isActive = (teacher.availability || []).some(a => a.dayOfWeek === dIdx + 1 && a.period === p);
                              return (
                                <button
                                  key={p}
                                  onClick={() => toggleAvailability(teacher, dIdx + 1, p)}
                                  disabled={teacher.active === false}
                                  className={`w-6 h-6 rounded-md text-xs font-medium flex items-center justify-center transition-all ${isActive ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'} ${teacher.active === false ? 'cursor-not-allowed grayscale' : ''}`}
                                >
                                  {p}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button onClick={() => toggleTeacherStatus(teacher)} className={`${teacher.active !== false ? 'text-orange-500 hover:text-orange-700 hover:bg-orange-50' : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'} p-2 rounded-md transition-colors`} title={teacher.active !== false ? "Dar de baja" : "Reactivar"}>
                      {teacher.active !== false ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
              ))}
              {teachers.length === 0 && (
                <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-500">No hay docentes registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-red-50 rounded-xl p-6 border border-red-200 animate-in slide-in-from-bottom-4 duration-500 delay-200">
        <h2 className="text-lg font-bold text-red-700 flex items-center gap-2 mb-4">
          <AlertTriangle className="h-5 w-5" />
          Zona de Peligro
        </h2>
        <p className="text-sm text-red-600 mb-6 max-w-3xl">
          Estas acciones son destructivas y no se pueden deshacer. Están diseñadas para reiniciar el sistema al comienzo de un nuevo curso escolar.
        </p>
        <div className="flex flex-wrap gap-4">
          <Button variant="danger" onClick={resetGuardias}>
            Reiniciar Guardias (Fin de curso)
          </Button>
          <Button variant="danger" onClick={resetTeachers}>
            Reiniciar Plantilla (Nuevos docentes)
          </Button>
        </div>
      </div>

      {/* Custom Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2">{confirmDialog.title}</h3>
            <p className="text-slate-600 mb-6 whitespace-pre-wrap">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setConfirmDialog(null)}>Cancelar</Button>
              <Button variant="danger" onClick={confirmDialog.onConfirm}>Confirmar y Borrar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Alert Dialog */}
      {alertDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="mx-auto w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <p className="text-slate-600 mb-6">{alertDialog.message}</p>
            <Button onClick={() => setAlertDialog(null)} className="w-full">Entendido</Button>
          </div>
        </div>
      )}

    </div>
  );
}
