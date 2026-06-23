import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc } from 'firebase/firestore';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { Teacher } from '../types';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { format } from 'date-fns';
import { AlertCircle, CheckCircle2, LogOut } from 'lucide-react';
import emailjs from '@emailjs/browser';

export function CreateGuardia() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [alertDialog, setAlertDialog] = useState<{ isOpen: boolean, message: string } | null>(null);

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [configGroups, setConfigGroups] = useState<string[]>([]);
  const [configSubjects, setConfigSubjects] = useState<string[]>([]);
  const [absentTeacherId, setAbsentTeacherId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [period, setPeriod] = useState(1);
  const [group, setGroup] = useState('');
  const [subject, setSubject] = useState('');
  const [task, setTask] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (user.email?.endsWith('@iesutrillas.es')) {
          setIsAuthenticated(true);
          setCurrentUser(user);
          if (!email) {
            setEmail(user.email);
          }
        } else {
          setIsAuthenticated(false);
          setCurrentUser(user);
        }
      } else {
        setIsAuthenticated(false);
        setCurrentUser(null);
      }
      setAuthLoading(false);
    });

    let unsubTeachers: () => void = () => {};
    let unsubConfig: () => void = () => {};
    if (isAuthenticated) {
      unsubTeachers = onSnapshot(collection(db, 'teachers'), (snap) => {
        setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Teacher)));
      });
      unsubConfig = onSnapshot(doc(db, 'config', 'general'), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.groups) setConfigGroups(data.groups);
          if (data.subjects) setConfigSubjects(data.subjects);
        }
      });
    }

    return () => { unsubAuth(); unsubTeachers(); unsubConfig(); };
  }, [isAuthenticated]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-blocked') {
        alert("El navegador ha bloqueado la ventana de Google. Por favor, abre la aplicación en una pestaña nueva (icono superior derecho) o permite las ventanas emergentes.");
      } else if (err.code !== 'auth/cancelled-popup-request') {
        alert("Error al iniciar sesión.");
      }
    }
  };

  const handleCreateGuardia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!absentTeacherId) {
      alert("Selecciona un docente ausente.");
      return;
    }
    
    setIsSubmitting(true);
    setSuccessMsg('');
    
    try {
      await addDoc(collection(db, 'guardias'), {
        absentTeacherId,
        substituteTeacherId: null,
        dateStr: date,
        period,
        group,
        subject,
        task,
        status: 'pending',
        createdAt: Date.now(),
        contactEmail: email,
        createdBy: currentUser?.email || 'unknown'
      });
      
      const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
      const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
      const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

      if (serviceId && templateId && publicKey) {
        await emailjs.send(serviceId, templateId, {
          to_email: email,
          subject: `Confirmación de Guardia Registrada (${date} - Turno ${period})`,
          message: `Guardia registrada correctamente. Se ha notificado tu ausencia al equipo directivo y se buscará un profesor de guardia para cubrir el turno ${period} del grupo ${group}. \n\nTarea asignada: ${task || 'Sin tarea'}`,
        }, publicKey);
      } else {
        console.warn("EmailJS credentials not configured.");
      }
      
      setSuccessMsg(`Se ha registrado la guardia y se ha enviado un correo de confirmación a ${email}.`);
      setGroup(''); setSubject(''); setTask('');
    } catch (err) {
      console.error(err);
      alert("Hubo un error al crear la guardia.");
    } finally {
      setIsSubmitting(false);
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
      <div className="max-w-md mx-auto mt-10 bg-white p-8 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in duration-500">
        <h2 className="text-xl font-semibold text-slate-900 mb-6 text-center">Acceso a Docentes</h2>
        <div className="space-y-4">
          <p className="text-sm text-slate-500 text-center mb-4">
            Inicia sesión con tu cuenta de @iesutrillas.es para registrar ausencias.
          </p>
          <Button onClick={handleLogin} className="w-full flex items-center justify-center gap-2">
            Iniciar sesión con Google
          </Button>
          {currentUser && !isAuthenticated && (
            <p className="text-sm text-red-500 text-center mt-4">
              La cuenta {currentUser.email} no pertenece al dominio @iesutrillas.es.
              <button className="text-indigo-600 hover:underline ml-1 block mt-2 text-center w-full" onClick={() => signOut(auth)}>Cerrar sesión y probar con otra</button>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="mb-2 sm:mb-0">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <div className="bg-orange-100 p-2 rounded-lg">
                <AlertCircle className="h-6 w-6 text-orange-600" />
              </div>
              Generar Nueva Guardia
            </h2>
            <p className="text-slate-500 mt-2">Rellena el formulario para notificar tu ausencia.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => signOut(auth)} variant="outline" className="flex items-center gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 whitespace-nowrap">
              <LogOut className="w-4 h-4" />
              <span>Salir</span>
            </Button>
          </div>
        </div>
        
        {successMsg && (
          <div className="mb-6 bg-green-50 text-green-800 p-4 rounded-xl flex items-start gap-3 border border-green-200">
             <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
             <p className="text-sm font-medium">{successMsg}</p>
          </div>
        )}

        <form onSubmit={handleCreateGuardia} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Docente Ausente</label>
              <select 
                value={absentTeacherId} 
                onChange={e => setAbsentTeacherId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
              >
                <option value="">-- Seleccionar Docente --</option>
                {teachers.filter(t => t.active !== false).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Correo de Confirmación</label>
              <Input 
                type="email" 
                placeholder="ejemplo@instituto.edu" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                required 
                className="py-2.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha de Guardia</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required className="py-2.5"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Turno a cubrir</label>
              <select 
                value={period} 
                onChange={e => setPeriod(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
              >
                {[1,2,3,4,5,6].map(p => <option key={p} value={p}>Turno {p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Grupo / Clase a cubrir</label>
              {configGroups.length > 0 ? (
                <select 
                  value={group} 
                  onChange={e => setGroup(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  required
                >
                  <option value="">-- Seleccionar Grupo --</option>
                  {configGroups.map((g, i) => <option key={i} value={g}>{g}</option>)}
                </select>
              ) : (
                <Input placeholder="Ej. 3º ESO B" value={group} onChange={e => setGroup(e.target.value)} required className="py-2.5" />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Asignatura</label>
              {configSubjects.length > 0 ? (
                <select 
                  value={subject} 
                  onChange={e => setSubject(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  required
                >
                  <option value="">-- Seleccionar Asignatura --</option>
                  {configSubjects.map((s, i) => <option key={i} value={s}>{s}</option>)}
                </select>
              ) : (
                <Input placeholder="Ej. Matemáticas" value={subject} onChange={e => setSubject(e.target.value)} required className="py-2.5" />
              )}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Tarea asignada para los alumnos</label>
            <textarea 
              placeholder="Ej. Leer la página 45 y hacer los ejercicios del 1 al 5 en el cuaderno." 
              value={task} 
              onChange={e => setTask(e.target.value)} 
              required 
              rows={4}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all resize-y"
            />
          </div>

          <Button type="submit" className="w-full h-12 text-base font-medium shadow-sm" disabled={isSubmitting}>
            {isSubmitting ? 'Generando guardia y enviando correo...' : 'Generar Guardia'}
          </Button>
        </form>
      </div>
    </div>
  );
}
