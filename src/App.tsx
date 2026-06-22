import { useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { GuardiasBoard } from './components/GuardiasBoard';
import { CreateGuardia } from './components/CreateGuardia';
import { School, Settings, Calendar, PlusCircle } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'board' | 'create' | 'admin'>('board');

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-sm">
              <School className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 hidden sm:block">Gestor de Guardias IES Fernando Lázaro Carreter</h1>
          </div>
          <nav className="flex gap-1.5 sm:gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('create')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'create' ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200/50' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <PlusCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Generar Guardia</span>
              <span className="sm:hidden">Generar</span>
            </button>
            <button
              onClick={() => setActiveTab('board')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'board' ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200/50' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Gestión de Guardias</span>
              <span className="sm:hidden">Gestión</span>
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'admin' ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200/50' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Administración</span>
              <span className="sm:hidden">Admin</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow">
        {activeTab === 'create' && <CreateGuardia />}
        {activeTab === 'board' && <GuardiasBoard />}
        {activeTab === 'admin' && <AdminPanel />}
      </main>

      <footer className="bg-white border-t border-slate-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-slate-500 font-medium">
            @ 2026 Andrés Cebrián - Todos los derechos reservados
          </p>
        </div>
      </footer>
    </div>
  );
}
