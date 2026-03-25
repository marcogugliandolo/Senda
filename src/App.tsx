/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { 
  Plane, 
  Wallet, 
  Calendar as CalendarIcon, 
  MapPin, 
  Plus, 
  Trash2, 
  ChevronRight, 
  Sparkles, 
  MessageSquare, 
  TrendingUp, 
  AlertCircle,
  CheckCircle2,
  Info,
  Scale,
  Users,
  Edit2,
  Save,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import * as Popover from '@radix-ui/react-popover';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { cn } from '@/src/lib/utils';

// --- Types ---

interface Expense {
  id: string;
  description: string;
  amount: number;
  paidBy: string; // Participant ID
  splitAmong: string[]; // Array of Participant IDs
  date: string;
}

interface Participant {
  id: string;
  name: string;
  budget: number;
  spent: number;
  contributed: number;
}

interface HiddenGem {
  name: string;
  description: string;
  rating: number;
  reviewSummary: string;
  mapsUrl: string;
  costEstimate: string;
}

interface TripDetails {
  destination: string;
  startDate: string;
  endDate: string;
  participants: Participant[];
  expenses: Expense[];
}

interface Activity {
  id?: string;
  time: string;
  activity: string;
  cost: number;
  isFree: boolean;
  location: string;
  notes?: string;
  isHiddenGem?: boolean;
  gemInfo?: HiddenGem;
}

interface ItineraryDay {
  day: number;
  date: string;
  activities: Activity[];
}

interface FinancialBreakdown {
  totalEstimated: number;
  perPerson: {
    name: string;
    amount: number;
    spent: number;
    balance: number; // amount - spent
    status: 'within' | 'exceeded';
  }[];
  suggestions: string[];
  compromiseProposals: {
    conflict: string;
    proposal: string;
    savings: string;
  }[];
}

// --- AI Service ---

// --- Initialization ---

const SYSTEM_INSTRUCTION = `Eres "Senda", una IA de élite diseñada para la planificación, mediación y gestión financiera de viajes grupales complejos. Tu objetivo es eliminar el estrés de la planificación y las discusiones por dinero, creando experiencias memorables y equilibradas.

CAPACIDADES CRÍTICAS:
1. Google Search: Úsalo para verificar precios actuales, horarios y valoraciones.
2. Cálculos exactos: Realiza desgloses financieros precisos, división de gastos y proyecciones.
3. Razonamiento Psicológico & Mediación: 
   - Media entre presupuestos dispares buscando el "Punto de Equilibrio de Felicidad".
   - Función "Compromiso": Si hay conflicto (ej. uno quiere hotel de 5* y otro hostal), propón una alternativa equilibrada.

REGLAS DE ORO:
- Ajusta el itinerario al presupuesto más bajo del grupo para evitar exclusión.
- Combina actividades gratuitas con experiencias de pago estratégicas.
- Para "Joyas Ocultas": Incluye siempre rating de Maps, resumen de reseñas y link.
- Formato: Siempre responde en español. Responde ÚNICAMENTE con el objeto JSON solicitado, sin texto adicional ni tablas fuera del JSON.`;

// --- Components ---

function DatePicker({ date, setDate, placeholder }: { date: string, setDate: (d: string) => void, placeholder: string }) {
  const [open, setOpen] = useState(false);
  const selectedDate = date ? new Date(date) : undefined;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="w-full px-4 py-4 bg-white border-b-2 border-gray-100 focus:border-black outline-none transition-all font-medium text-left flex items-center justify-between group">
          {selectedDate ? format(selectedDate, 'dd MMM yyyy', { locale: es }) : <span className="text-gray-400">{placeholder}</span>}
          <CalendarIcon className="w-5 h-5 text-gray-400 group-hover:text-slate-900 transition-colors" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="z-50 bg-white p-4 rounded-3xl shadow-2xl border border-slate-100" align="start" sideOffset={8}>
          <DayPicker 
            mode="single" 
            selected={selectedDate} 
            onSelect={(d) => {
              if (d) {
                const adjustedDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
                setDate(adjustedDate.toISOString().split('T')[0]);
              } else {
                setDate('');
              }
              setOpen(false);
            }} 
            locale={es}
            className="font-sans"
            classNames={{
              day_selected: "bg-slate-900 text-white hover:bg-slate-800",
              day_today: "font-bold text-slate-900",
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const LoadingOverlay = () => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 text-white overflow-hidden"
    >
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_50%_50%,_#ffffff_0%,_transparent_60%)]" />
      
      <motion.div
        animate={{ 
          rotate: 360,
          scale: [1, 1.1, 1],
        }}
        transition={{ 
          rotate: { duration: 3, repeat: Infinity, ease: "linear" },
          scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
        }}
        className="relative w-32 h-32 flex items-center justify-center mb-8"
      >
        <div className="absolute inset-0 border-2 border-dashed border-white/20 rounded-full" />
        <Plane className="w-12 h-12 text-white -rotate-45" />
      </motion.div>

      <motion.h2 
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        className="text-3xl font-bold tracking-tight mb-4 z-10"
      >
        Diseñando tu experiencia...
      </motion.h2>
      
      <p className="text-slate-400 font-medium text-sm z-10">
        Senda está trazando la ruta perfecta para tu grupo
      </p>
    </motion.div>
  );
};

export default function App() {
  const [step, setStep] = useState<'landing' | 'profiling' | 'dashboard'>('landing');
  const [activeTab, setActiveTab] = useState<'itinerary' | 'finances' | 'chat'>('itinerary');
  const [trip, setTrip] = useState<TripDetails>({
    destination: '',
    startDate: '',
    endDate: '',
    participants: [{ id: '1', name: '', budget: 0, spent: 0, contributed: 0 }],
    expenses: []
  });
  const [itinerary, setItinerary] = useState<ItineraryDay[]>([]);
  const [financials, setFinancials] = useState<FinancialBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [editingActivity, setEditingActivity] = useState<{ dayIndex: number, actIndex: number } | null>(null);
  const [editForm, setEditForm] = useState<Activity | null>(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: 0,
    paidBy: '',
    splitAmong: [] as string[]
  });

  const isApiKeyMissing = !process.env.GEMINI_API_KEY;

  const generateDemoTrip = () => {
    const demoData = {
      itinerary: [
        {
          day: 1,
          date: "Día 1",
          activities: [
            { id: '1', time: "10:00", activity: "Llegada y Check-in", cost: 0, isFree: true, location: trip.destination, notes: "Bienvenidos a vuestra aventura." },
            { id: '2', time: "13:00", activity: "Almuerzo de Bienvenida", cost: 25, isFree: false, location: "Centro Ciudad", notes: "Probando la gastronomía local." },
            { id: '3', time: "16:00", activity: "Tour Panorámico", cost: 0, isFree: true, location: "Mirador Principal", isHiddenGem: true, gemInfo: { name: "Mirador Secreto", rating: 4.9, reviewSummary: "Vistas increíbles sin multitudes.", mapsUrl: "#", costEstimate: "Gratis" } }
          ]
        }
      ],
      financials: {
        totalEstimated: 150,
        perPerson: trip.participants.map(p => ({ name: p.name, amount: p.budget, spent: 0, balance: p.budget, status: 'within' as const })),
        suggestions: ["Aprovechad las horas doradas para fotos.", "Reservad con antelación los restaurantes populares."],
        compromiseProposals: [{ conflict: "Presupuestos variados", proposal: "Alternar cenas de lujo con picnics escénicos.", savings: "40€/persona" }]
      },
      conciergeMessage: "¡Hola! Como no hay una clave de API configurada, he generado este itinerario de demostración para que veas cómo funciona Senda. ¡Configura tu clave para planes reales!"
    };

    setItinerary(demoData.itinerary);
    setFinancials(demoData.financials);
    setChatMessages([{ role: 'model', text: demoData.conciergeMessage }]);
    setStep('dashboard');
  };

  // --- Logic ---

  const handleEditActivity = (dayIndex: number, actIndex: number) => {
    setEditingActivity({ dayIndex, actIndex });
    setEditForm({ ...itinerary[dayIndex].activities[actIndex] });
  };

  const handleSaveActivity = () => {
    if (!editingActivity || !editForm) return;
    
    setItinerary(prev => {
      const newItinerary = [...prev];
      newItinerary[editingActivity.dayIndex].activities[editingActivity.actIndex] = editForm;
      return newItinerary;
    });
    
    setEditingActivity(null);
    setEditForm(null);
  };

  const handleCancelEdit = () => {
    setEditingActivity(null);
    setEditForm(null);
  };

  const handleDeleteActivity = (dayIndex: number, actIndex: number) => {
    setItinerary(prev => {
      const newItinerary = [...prev];
      newItinerary[dayIndex].activities.splice(actIndex, 1);
      return newItinerary;
    });
  };

  const handleAddActivity = (dayIndex: number) => {
    setItinerary(prev => {
      const newItinerary = [...prev];
      newItinerary[dayIndex].activities.push({
        id: Math.random().toString(36).substr(2, 9),
        time: '12:00',
        activity: 'Nueva Actividad',
        cost: 0,
        isFree: true,
        location: 'Ubicación'
      });
      return newItinerary;
    });
    // Automatically open edit mode for the new activity
    setEditingActivity({ dayIndex, actIndex: itinerary[dayIndex].activities.length });
    setEditForm({
      time: '12:00',
      activity: 'Nueva Actividad',
      cost: 0,
      isFree: true,
      location: 'Ubicación'
    });
  };

  const handleAddExpense = () => {
    if (!newExpense.description || newExpense.amount <= 0 || !newExpense.paidBy || newExpense.splitAmong.length === 0) {
      alert('Por favor, completa todos los campos del gasto.');
      return;
    }

    const expense: Expense = {
      id: Math.random().toString(36).substr(2, 9),
      description: newExpense.description,
      amount: newExpense.amount,
      paidBy: newExpense.paidBy,
      splitAmong: newExpense.splitAmong,
      date: new Date().toISOString()
    };

    setTrip(prev => {
      const updatedParticipants = prev.participants.map(p => {
        let newSpent = p.spent;
        let newContributed = p.contributed;

        // If they paid, they contributed the full amount
        if (p.id === expense.paidBy) {
          newContributed += expense.amount;
        }

        // If they are in the split, they spent their share
        if (expense.splitAmong.includes(p.id)) {
          newSpent += expense.amount / expense.splitAmong.length;
        }

        return { ...p, spent: newSpent, contributed: newContributed };
      });

      return {
        ...prev,
        participants: updatedParticipants,
        expenses: [...prev.expenses, expense]
      };
    });

    // Update financials state to reflect real-time changes
    setFinancials(prev => {
      if (!prev) return null;
      return {
        ...prev,
        perPerson: prev.perPerson.map(pp => {
          const participant = trip.participants.find(p => p.name === pp.name);
          if (!participant) return pp;
          
          // Recalculate based on the new expense
          let addedSpent = 0;
          if (expense.splitAmong.includes(participant.id)) {
            addedSpent = expense.amount / expense.splitAmong.length;
          }
          
          const newTotalSpent = pp.spent + addedSpent;
          return {
            ...pp,
            spent: newTotalSpent,
            balance: pp.amount - newTotalSpent,
            status: newTotalSpent > pp.amount ? 'exceeded' : 'within'
          };
        })
      };
    });

    setShowExpenseModal(false);
    setNewExpense({ description: '', amount: 0, paidBy: '', splitAmong: [] });
  };

  const handleAddParticipant = () => {
    setTrip(prev => ({
      ...prev,
      participants: [...prev.participants, { id: Math.random().toString(36).substr(2, 9), name: '', budget: 0, spent: 0, contributed: 0 }]
    }));
  };

  const handleRemoveParticipant = (id: string) => {
    if (trip.participants.length > 1) {
      setTrip(prev => ({
        ...prev,
        participants: prev.participants.filter(p => p.id !== id)
      }));
    }
  };

  const handleParticipantChange = (id: string, field: 'name' | 'budget', value: string | number) => {
    setTrip(prev => ({
      ...prev,
      participants: prev.participants.map(p => p.id === id ? { ...p, [field]: value } : p)
    }));
  };

  const generateTrip = async () => {
    if (!trip.destination || !trip.startDate || !trip.endDate || trip.participants.some(p => !p.name || p.budget <= 0)) {
      alert('Por favor, completa todos los campos correctamente.');
      return;
    }

    setLoading(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        // Fallback to demo if no API key
        generateDemoTrip();
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Planifica un viaje a ${trip.destination} del ${trip.startDate} al ${trip.endDate}.
      Participantes y sus presupuestos individuales:
      ${trip.participants.map(p => `- ${p.name}: ${p.budget}€`).join('\n')}
      
      Genera:
      1. Un itinerario detallado día a día en formato JSON.
      2. Un desglose financiero que incluya el total estimado y cuánto debe poner cada uno.
      3. Sugerencias de "Joyas Ocultas" con información de Google Maps (rating, resumen de reseñas, link).
      4. Propuestas de "Compromiso" si detectas que los presupuestos son muy variados.
      
      Responde con un JSON que tenga esta estructura:
      {
        "itinerary": [{ 
          "day": 1, 
          "date": "...", 
          "activities": [{ 
            "time": "...", 
            "activity": "...", 
            "cost": 0, 
            "isFree": true, 
            "location": "...",
            "isHiddenGem": false,
            "gemInfo": { "name": "...", "rating": 4.5, "reviewSummary": "...", "mapsUrl": "...", "costEstimate": "..." } 
          }] 
        }],
        "financials": { 
          "totalEstimated": 0, 
          "perPerson": [{ "name": "...", "amount": 0, "spent": 0, "balance": 0, "status": "within" }], 
          "suggestions": ["..."],
          "compromiseProposals": [{ "conflict": "...", "proposal": "...", "savings": "..." }]
        },
        "conciergeMessage": "..."
      }`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          maxOutputTokens: 8192
        }
      });

      let jsonText = response.text || '{}';
      // Clean markdown if present
      if (jsonText.includes('```json')) {
        jsonText = jsonText.split('```json')[1].split('```')[0];
      } else if (jsonText.includes('```')) {
        jsonText = jsonText.split('```')[1].split('```')[0];
      }
      
      const data = JSON.parse(jsonText.trim());
      const itineraryWithIds = (data.itinerary || []).map((day: any) => ({
        ...day,
        activities: day.activities.map((act: any) => ({ ...act, id: Math.random().toString(36).substr(2, 9) }))
      }));
      setItinerary(itineraryWithIds);
      setFinancials(data.financials || null);
      setChatMessages([{ role: 'model', text: data.conciergeMessage || '¡Hola! He preparado el viaje perfecto para vuestro grupo.' }]);
      setStep('dashboard');
    } catch (error: any) {
      console.error('Error generating trip:', error);
      if (error.message === 'API_KEY_MISSING') {
        alert('Falta la clave de API de Gemini. Por favor, configúrala en el menú de Ajustes > API Keys de AI Studio.');
      } else {
        alert('Hubo un error al generar el viaje. Inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMsg = { role: 'user' as const, text: inputMessage };
    setChatMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setLoading(true);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        setChatMessages(prev => [...prev, { role: 'model', text: '¡Hola! Estoy en modo demo porque no hay una clave de API configurada. Puedo responderte de forma básica: ¡Tu viaje a ' + trip.destination + ' tiene una pinta increíble!' }]);
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: { 
          systemInstruction: SYSTEM_INSTRUCTION,
          maxOutputTokens: 8192
        }
      });

      // Include context of current trip
      const context = `Contexto actual: Viaje a ${trip.destination}. Presupuestos: ${trip.participants.map(p => `${p.name}: ${p.budget}€`).join(', ')}. Itinerario actual: ${JSON.stringify(itinerary)}`;
      
      const response = await chat.sendMessage({ message: `${context}\n\nUsuario dice: ${inputMessage}` });
      setChatMessages(prev => [...prev, { role: 'model', text: response.text || 'No pude procesar eso.' }]);
    } catch (error: any) {
      console.error('Chat error:', error);
      if (error.message === 'API_KEY_MISSING') {
        setChatMessages(prev => [...prev, { role: 'model', text: '⚠️ Falta la clave de API de Gemini. Configúrala en Ajustes > API Keys.' }]);
      }
    } finally {
      setLoading(false);
    }
  };

  // --- Views ---

  return (
    <div className="min-h-screen bg-white font-sans">
      {isApiKeyMissing && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center justify-center gap-2 text-amber-800 text-xs font-medium sticky top-0 z-[100]">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Falta la clave de API de Gemini. Configúrala en Ajustes {'>'} API Keys para que la IA funcione.</span>
        </div>
      )}

      {step === 'landing' && (
        <div className="min-h-screen flex flex-col lg:flex-row bg-white">
          {/* Left Content */}
          <div className="flex-1 flex flex-col justify-center px-8 lg:px-24 py-16 lg:py-0 z-10 bg-white">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full mb-8 w-max">
              <Sparkles className="text-slate-900 w-4 h-4" />
              <span className="text-[10px] font-bold text-slate-900 uppercase tracking-[0.2em]">Senda AI Travel</span>
            </div>
            
            <h1 className="text-6xl sm:text-7xl lg:text-9xl font-bold tracking-tighter text-slate-900 mb-6 leading-[0.9]">
              Senda.
            </h1>
            
            <p className="text-xl lg:text-2xl text-slate-500 mb-12 font-medium leading-relaxed max-w-xl">
              El camino inteligente para viajar en grupo. Planifica, media y gestiona finanzas con precisión algorítmica.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <button 
                onClick={() => setStep('profiling')}
                className="w-full sm:w-auto px-10 py-5 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 transition-all duration-300 flex items-center justify-center gap-2 shadow-2xl shadow-slate-900/20"
              >
                Comenzar Ruta <ChevronRight className="w-5 h-5" />
              </button>
              <button 
                onClick={() => {
                  setTrip(prev => ({ ...prev, destination: 'París' }));
                  generateDemoTrip();
                }}
                className="w-full sm:w-auto px-10 py-5 bg-white text-slate-900 border border-slate-200 rounded-full font-bold hover:bg-slate-50 transition-all"
              >
                Ver Demo
              </button>
            </div>
          </div>

          {/* Right Image */}
          <div className="flex-1 relative hidden lg:block p-4">
            <div className="w-full h-full rounded-[2.5rem] overflow-hidden relative">
              <img 
                src="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=2021" 
                alt="Travel" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent" />
            </div>
          </div>
        </div>
      )}

      {step === 'profiling' && (
        <div className="min-h-screen bg-white p-6 md:p-12 font-sans">
          <AnimatePresence>
            {loading && <LoadingOverlay />}
          </AnimatePresence>
          <div className="max-w-5xl mx-auto">
            <header className="flex items-center justify-between mb-16">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200">
                  <Plane className="text-white w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">Senda</h2>
              </div>
            <button onClick={() => setStep('landing')} className="text-xs font-bold text-slate-400 hover:text-slate-900 transition-all uppercase tracking-[0.2em] px-4 py-2 rounded-full hover:bg-slate-50">
              Cancelar
            </button>
          </header>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
            <div className="lg:col-span-4">
              <h3 className="text-3xl sm:text-4xl font-bold tracking-tighter text-slate-900 mb-6 leading-tight">Configura tu Ruta</h3>
              <p className="text-slate-500 leading-relaxed font-medium text-sm sm:text-base">
                Cuéntanos a dónde quieres ir y quiénes te acompañan. Nuestra IA se encargará de encontrar el equilibrio perfecto para todos.
              </p>
            </div>

            <div className="lg:col-span-8 space-y-12">
              <section className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Destino</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input 
                        type="text" 
                        placeholder="Ej. Islandia, Japón, Bali..." 
                        className="w-full pl-12 pr-4 py-4 bg-white border-b-2 border-gray-100 focus:border-black outline-none transition-all text-lg font-medium"
                        value={trip.destination}
                        onChange={e => setTrip(prev => ({ ...prev, destination: e.target.value }))}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Desde</label>
                      <DatePicker 
                        date={trip.startDate} 
                        setDate={(d) => setTrip(prev => ({ ...prev, startDate: d }))} 
                        placeholder="Fecha inicio" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Hasta</label>
                      <DatePicker 
                        date={trip.endDate} 
                        setDate={(d) => setTrip(prev => ({ ...prev, endDate: d }))} 
                        placeholder="Fecha fin" 
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                  <h4 className="text-xl font-display font-bold tracking-tight">Exploradores</h4>
                  <button 
                    onClick={handleAddParticipant}
                    className="flex items-center gap-2 text-xs font-bold text-orange-600 hover:text-orange-700 transition-all uppercase tracking-widest"
                  >
                    <Plus className="w-4 h-4" /> Añadir Persona
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {trip.participants.map((p) => (
                    <motion.div 
                      key={p.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group relative bg-white p-6 rounded-3xl border border-gray-100 hover:border-black transition-all shadow-sm"
                    >
                      <button 
                        onClick={() => handleRemoveParticipant(p.id)}
                        className="absolute -top-2 -right-2 w-8 h-8 bg-white border border-gray-100 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      
                      <div className="space-y-4">
                        <input 
                          type="text" 
                          placeholder="Nombre" 
                          className="w-full bg-transparent border-b border-gray-50 focus:border-black outline-none py-2 font-bold text-gray-900"
                          value={p.name}
                          onChange={e => handleParticipantChange(p.id, 'name', e.target.value)}
                        />
                        <div className="flex items-center gap-2">
                          <Wallet className="text-gray-300 w-4 h-4" />
                          <input 
                            type="number" 
                            placeholder="Presupuesto (€)" 
                            className="w-full bg-transparent outline-none text-sm text-gray-600"
                            value={p.budget || ''}
                            onChange={e => handleParticipantChange(p.id, 'budget', parseFloat(e.target.value))}
                          />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>

              <div className="pt-8">
                <button 
                  onClick={generateTrip}
                  disabled={loading}
                  className="w-full py-6 bg-slate-900 text-white rounded-full font-bold text-xl hover:bg-slate-800 transition-all duration-500 disabled:opacity-50 flex items-center justify-center gap-3 shadow-2xl shadow-slate-900/20"
                >
                  {loading ? (
                    <>
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Trazando Itinerario...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-6 h-6" />
                      Crear Experiencia Senda
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {step === 'dashboard' && (
        <div className="min-h-screen bg-[#F9FAFB] flex flex-col md:flex-row font-sans text-slate-900">
          {/* Sidebar - Navigation */}
          <aside className="w-full md:w-72 bg-white border-b md:border-b-0 md:border-r border-slate-100 flex flex-col md:sticky top-0 md:h-screen z-40">
        <div className="p-6 md:p-8 md:pb-12 flex items-center justify-between md:justify-start gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg shadow-slate-200">
              <Plane className="text-white w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Senda</h1>
            {isApiKeyMissing && (
              <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Demo</span>
            )}
          </div>
        </div>

        <nav className="px-4 pb-4 md:pb-0 space-y-1.5 md:flex-1 flex md:flex-col gap-2 overflow-x-auto hide-scrollbar">
          <button 
            onClick={() => setActiveTab('itinerary')}
            className={cn(
              "flex-shrink-0 md:w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-200 group",
              activeTab === 'itinerary' 
                ? "bg-slate-900 text-white shadow-md shadow-slate-200" 
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            <CalendarIcon className={cn("w-5 h-5", activeTab === 'itinerary' ? "text-white" : "text-slate-400 group-hover:text-slate-600")} /> 
            <span>Itinerario</span>
          </button>
          <button 
            onClick={() => setActiveTab('finances')}
            className={cn(
              "flex-shrink-0 md:w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-200 group",
              activeTab === 'finances' 
                ? "bg-slate-900 text-white shadow-md shadow-slate-200" 
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            <TrendingUp className={cn("w-5 h-5", activeTab === 'finances' ? "text-white" : "text-slate-400 group-hover:text-slate-600")} /> 
            <span>Finanzas & Perfiles</span>
          </button>
          <button 
            onClick={() => setActiveTab('chat')}
            className={cn(
              "flex-shrink-0 md:w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-200 group",
              activeTab === 'chat' 
                ? "bg-slate-900 text-white shadow-md shadow-slate-200" 
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            <MessageSquare className={cn("w-5 h-5", activeTab === 'chat' ? "text-white" : "text-slate-400 group-hover:text-slate-600")} /> 
            <span>Asistente Senda</span>
          </button>
        </nav>

        <div className="p-6 mt-auto hidden md:block">
          <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">Destino Actual</p>
            <p className="font-display font-bold tracking-tight text-xl text-slate-900 leading-tight">{trip.destination}</p>
            <div className="flex items-center gap-2 mt-3 text-xs font-medium text-slate-500">
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>{format(new Date(trip.startDate), 'dd MMM', { locale: es })} - {format(new Date(trip.endDate), 'dd MMM', { locale: es })}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto h-screen scroll-smooth">
        <div className="max-w-5xl mx-auto p-4 md:p-12 space-y-8 md:space-y-12">
          
          {activeTab === 'itinerary' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-12"
            >
              {/* Financial Summary Mini */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between mb-10">
                    <div>
                      <h3 className="text-2xl font-display font-bold tracking-tight text-slate-900">Estado de Presupuestos</h3>
                      <p className="text-xs font-medium text-slate-400 mt-1 uppercase tracking-wider">Comparativa de gasto real vs estimado</p>
                    </div>
                    <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-slate-400" />
                    </div>
                  </div>
                  
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={financials?.perPerson || []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94A3B8', fontSize: 12, fontWeight: 500 }}
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94A3B8', fontSize: 12, fontWeight: 500 }}
                        />
                        <Tooltip 
                          cursor={{ fill: '#F8FAFC' }}
                          contentStyle={{ 
                            borderRadius: '20px', 
                            border: 'none', 
                            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                            padding: '12px 16px'
                          }}
                        />
                        <Bar dataKey="amount" name="Estimado" fill="#E2E8F0" radius={[6, 6, 0, 0]} barSize={32} />
                        <Bar dataKey="spent" name="Gastado" fill="#0F172A" radius={[6, 6, 0, 0]} barSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-slate-900 text-white p-6 md:p-10 rounded-[2.5rem] shadow-2xl flex flex-col justify-between relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Plane className="w-32 h-32 rotate-12" />
                  </div>
                  
                  <div className="relative z-10">
                    <p className="text-slate-400 text-[10px] font-bold mb-2 uppercase tracking-[0.2em]">Presupuesto Total</p>
                    <h4 className="text-5xl font-display font-bold tracking-tight mb-10">{financials?.totalEstimated.toLocaleString()}€</h4>
                    
                    <div className="space-y-6">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sugerencias IA</p>
                      {financials?.suggestions.slice(0, 2).map((s, i) => (
                        <div key={i} className="flex gap-4 text-sm text-slate-300 leading-relaxed items-start">
                          <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                            <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                          </div>
                          <p>{s}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setActiveTab('finances')}
                    className="relative z-10 mt-10 w-full py-4 bg-white text-slate-900 rounded-2xl text-sm font-bold hover:bg-slate-100 transition-all shadow-lg shadow-black/20"
                  >
                    Gestionar Finanzas
                  </button>
                </div>
              </section>

              {/* Itinerary */}
              <section className="space-y-10">
                <div className="flex items-center justify-between">
                  <h3 className="text-3xl font-display font-bold tracking-tight text-slate-900">Itinerario Maestro</h3>
                  <div className="px-4 py-1.5 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {itinerary.length} Días Planificados
                  </div>
                </div>
                
                <div className="space-y-16">
                  {itinerary.map((day, dayIndex) => (
                    <motion.div 
                      layout
                      key={day.day} 
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: dayIndex * 0.1 }}
                      className="relative pl-8 sm:pl-12"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-200" />
                      <div className="absolute left-[-5px] top-2 w-[11px] h-[11px] rounded-full bg-slate-900 ring-4 ring-white shadow-sm" />
                      
                      <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-6 mb-8">
                        <h4 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-slate-900">Día {day.day}</h4>
                        <span className="text-slate-400 font-semibold tracking-tight text-sm sm:text-base">{day.date}</span>
                      </div>

                      <div className="grid grid-cols-1 gap-6">
                        <AnimatePresence mode="popLayout">
                          {day.activities.map((act, actIndex) => {
                            const isEditing = editingActivity?.dayIndex === dayIndex && editingActivity?.actIndex === actIndex;
                            
                            return (
                              <motion.div 
                                layout
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -20 }}
                                transition={{ duration: 0.2 }}
                                key={act.id || actIndex} 
                                className="bg-white rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all duration-300 p-6 md:p-8 group"
                              >
                                {isEditing && editForm ? (
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between mb-4">
                                    <h5 className="text-lg font-bold text-slate-900">Editar Actividad</h5>
                                    <div className="flex gap-2">
                                      <button onClick={handleCancelEdit} className="p-2 text-slate-400 hover:text-slate-600 bg-slate-50 rounded-full"><X className="w-4 h-4" /></button>
                                      <button onClick={handleSaveActivity} className="p-2 text-white bg-slate-900 hover:bg-slate-800 rounded-full"><Save className="w-4 h-4" /></button>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <input type="text" value={editForm.time} onChange={e => setEditForm({...editForm, time: e.target.value})} className="px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-slate-200" placeholder="Hora (ej. 10:00)" />
                                    <input type="text" value={editForm.activity} onChange={e => setEditForm({...editForm, activity: e.target.value})} className="px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-slate-200" placeholder="Actividad" />
                                    <input type="text" value={editForm.location} onChange={e => setEditForm({...editForm, location: e.target.value})} className="px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-slate-200" placeholder="Ubicación" />
                                    <input type="number" value={editForm.cost} onChange={e => setEditForm({...editForm, cost: Number(e.target.value)})} className="px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-slate-200" placeholder="Coste (€)" />
                                    <textarea value={editForm.notes || ''} onChange={e => setEditForm({...editForm, notes: e.target.value})} className="px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-slate-200 md:col-span-2" placeholder="Notas adicionales" rows={2} />
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col md:flex-row gap-6 md:gap-8">
                                  {/* Content */}
                                  <div className="flex-1 flex flex-col justify-center">
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                                      <div className="flex gap-4 md:gap-6 items-start">
                                        <div className="text-xs font-mono font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg mt-1 shrink-0">{act.time}</div>
                                        <div>
                                          <div className="flex items-center flex-wrap gap-3">
                                            <h5 className="text-lg font-bold text-slate-900">{act.activity}</h5>
                                            {act.isHiddenGem && (
                                              <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                                                <Sparkles className="w-3 h-3" /> Joya Oculta
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 text-sm font-medium text-slate-500 mt-2">
                                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" /> <span className="line-clamp-1">{act.location}</span>
                                          </div>
                                          {act.notes && (
                                            <div className="mt-4 p-3 bg-slate-50 rounded-xl border-l-2 border-slate-200">
                                              <p className="text-sm text-slate-500 italic leading-relaxed">{act.notes}</p>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <div className="shrink-0 flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-4 md:gap-0">
                                        <div className="md:text-right">
                                          <div className="text-2xl font-display font-bold tracking-tight text-slate-900">
                                            {act.isFree ? <span className="text-emerald-600">Gratis</span> : `${act.cost}€`}
                                          </div>
                                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 hidden md:block">Coste Estimado</p>
                                        </div>
                                        <div className="flex items-center gap-2 md:mt-4 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button onClick={() => handleEditActivity(dayIndex, actIndex)} className="p-2 text-slate-400 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors">
                                            <Edit2 className="w-4 h-4" />
                                          </button>
                                          <button onClick={() => handleDeleteActivity(dayIndex, actIndex)} className="p-2 text-rose-400 hover:text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-full transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </div>
                                    </div>

                                    {act.isHiddenGem && act.gemInfo && (
                                      <motion.div 
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        className="mt-6 pt-6 border-t border-slate-50"
                                      >
                                        <div className="bg-indigo-50/50 rounded-2xl p-6 flex flex-col md:flex-row gap-8">
                                          <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-3">
                                              <div className="flex items-center text-amber-500">
                                                {[...Array(5)].map((_, i) => (
                                                  <Sparkles key={i} className={cn("w-3.5 h-3.5", i < Math.floor(act.gemInfo!.rating) ? "fill-current" : "opacity-20")} />
                                                ))}
                                              </div>
                                              <span className="text-xs font-bold text-slate-600">{act.gemInfo.rating} / 5.0</span>
                                            </div>
                                            <p className="text-sm text-slate-600 leading-relaxed mb-4">
                                              <span className="font-bold text-indigo-700">Resumen de Reseñas:</span> {act.gemInfo.reviewSummary}
                                            </p>
                                            <a 
                                              href={act.gemInfo.mapsUrl} 
                                              target="_blank" 
                                              rel="noreferrer"
                                              className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-xl text-xs font-bold text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                            >
                                              Explorar en Google Maps <ChevronRight className="w-3.5 h-3.5" />
                                            </a>
                                          </div>
                                          <div className="md:w-40 shrink-0">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Rango de Precios</p>
                                            <p className="text-sm font-bold text-slate-700">{act.gemInfo.costEstimate}</p>
                                            <div className="mt-4 pt-4 border-t border-indigo-100/50">
                                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Recomendado por</p>
                                              <p className="text-xs font-medium text-indigo-600">Algoritmo Senda</p>
                                            </div>
                                          </div>
                                        </div>
                                      </motion.div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                        </AnimatePresence>
                        <motion.div layout>
                          <button 
                            onClick={() => handleAddActivity(dayIndex)}
                            className="w-full py-6 border-2 border-dashed border-slate-200 rounded-[2rem] text-slate-400 font-bold hover:border-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center gap-2"
                          >
                            <Plus className="w-5 h-5" /> Añadir Actividad
                          </button>
                        </motion.div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'finances' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-12"
            >
              <section className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-display font-bold tracking-tight text-slate-900">Perfiles de Viajeros</h3>
                    <Users className="w-5 h-5 text-slate-400" />
                  </div>
                  <div className="space-y-4">
                    {trip.participants.map(p => (
                      <div key={p.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:border-slate-200 transition-all">
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center font-bold text-slate-500 text-lg">
                              {p.name.charAt(0)}
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-900">{p.name}</h4>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Presupuesto: {p.budget}€</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Gasto Real</p>
                            <p className={cn("text-xl font-display font-bold tracking-tight", p.spent > p.budget ? "text-rose-500" : "text-slate-900")}>
                              {p.spent}€
                            </p>
                          </div>
                        </div>
                        <div className="relative w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full transition-all duration-500 ease-out", p.spent > p.budget ? "bg-rose-500" : "bg-slate-900")}
                            style={{ width: `${Math.min((p.spent / p.budget) * 100, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">
                          <span>Utilizado: {Math.round((p.spent / p.budget) * 100)}%</span>
                          <span>Restante: {Math.max(0, p.budget - p.spent)}€</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-display font-bold tracking-tight text-slate-900">Mediación de Conflictos</h3>
                    <Scale className="w-5 h-5 text-slate-400" />
                  </div>
                  <div className="space-y-4">
                    {financials?.compromiseProposals.map((prop, i) => (
                      <div key={i} className="bg-slate-900 text-white p-6 md:p-8 rounded-[2rem] shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                          <AlertCircle className="w-20 h-20" />
                        </div>
                        <div className="relative z-10">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Conflicto Detectado</h4>
                          </div>
                          <h5 className="text-lg font-bold mb-3 text-white">{prop.conflict}</h5>
                          <p className="text-sm text-slate-400 leading-relaxed mb-6">
                            {prop.proposal}
                          </p>
                          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-xl text-xs font-bold text-orange-400 border border-white/5">
                            <Sparkles className="w-3.5 h-3.5" /> Ahorro Proyectado: {prop.savings}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!financials?.compromiseProposals || financials.compromiseProposals.length === 0) && (
                      <div className="bg-slate-50 p-8 md:p-12 rounded-[2rem] border border-dashed border-slate-200 text-center">
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                        </div>
                        <p className="text-sm font-medium text-slate-500 italic">Armonía financiera total. No se requieren propuestas de compromiso.</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                  <div>
                    <h3 className="text-2xl font-display font-bold tracking-tight text-slate-900">Registro de Gastos</h3>
                    <p className="text-xs font-medium text-slate-400 mt-1 uppercase tracking-wider">Historial detallado de transacciones del grupo</p>
                  </div>
                  <button 
                    onClick={() => {
                      setNewExpense(prev => ({ ...prev, paidBy: trip.participants[0]?.id || '', splitAmong: trip.participants.map(p => p.id) }));
                      setShowExpenseModal(true);
                    }}
                    className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-sm font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-200"
                  >
                    <Plus className="w-4 h-4" /> Registrar Gasto
                  </button>
                </div>

                {showExpenseModal && (
                  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-white w-full max-w-md rounded-3xl p-6 md:p-8 shadow-2xl"
                    >
                      <h4 className="text-xl font-display font-bold tracking-tight mb-6">Nuevo Gasto</h4>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Descripción</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-2 bg-gray-50 rounded-xl outline-none"
                            value={newExpense.description}
                            onChange={e => setNewExpense(prev => ({ ...prev, description: e.target.value }))}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Monto (€)</label>
                            <input 
                              type="number" 
                              className="w-full px-4 py-2 bg-gray-50 rounded-xl outline-none"
                              value={newExpense.amount || ''}
                              onChange={e => setNewExpense(prev => ({ ...prev, amount: parseFloat(e.target.value) }))}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Pagado por</label>
                            <select 
                              className="w-full px-4 py-2 bg-gray-50 rounded-xl outline-none"
                              value={newExpense.paidBy}
                              onChange={e => setNewExpense(prev => ({ ...prev, paidBy: e.target.value }))}
                            >
                              {trip.participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Dividir entre</label>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            {trip.participants.map(p => (
                              <label key={p.id} className="flex items-center gap-2 text-sm">
                                <input 
                                  type="checkbox" 
                                  checked={newExpense.splitAmong.includes(p.id)}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setNewExpense(prev => ({ ...prev, splitAmong: [...prev.splitAmong, p.id] }));
                                    } else {
                                      setNewExpense(prev => ({ ...prev, splitAmong: prev.splitAmong.filter(id => id !== p.id) }));
                                    }
                                  }}
                                />
                                {p.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3 mt-8">
                        <button 
                          onClick={() => setShowExpenseModal(false)}
                          className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                        >
                          Cancelar
                        </button>
                        <button 
                          onClick={handleAddExpense}
                          className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all"
                        >
                          Guardar
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="pb-5 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Descripción</th>
                        <th className="pb-5 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Pagado por</th>
                        <th className="pb-5 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {trip.expenses.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-12 text-center text-sm text-slate-400 italic font-medium">No hay gastos registrados todavía.</td>
                        </tr>
                      ) : (
                        trip.expenses.map(exp => (
                          <tr key={exp.id} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="py-5 font-semibold text-slate-900">{exp.description}</td>
                            <td className="py-5">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-500">
                                  {trip.participants.find(p => p.id === exp.paidBy)?.name.charAt(0)}
                                </div>
                                <span className="text-sm font-medium text-slate-600">{trip.participants.find(p => p.id === exp.paidBy)?.name}</span>
                              </div>
                            </td>
                            <td className="py-5 text-right font-display font-bold tracking-tight text-lg text-slate-900">{exp.amount}€</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'chat' && (
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl overflow-hidden flex flex-col h-[calc(100vh-200px)] md:h-[750px]"
            >
              <div className="p-4 md:p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200">
                    <Sparkles className="text-white w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold tracking-tight text-slate-900">Asistente Senda</h4>
                    <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-1.5 uppercase tracking-widest mt-0.5">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Inteligencia Activa
                    </p>
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <Info className="w-3.5 h-3.5" /> Contexto de Viaje Cargado
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8 scroll-smooth">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[85%] p-5 rounded-[1.5rem] text-sm leading-relaxed shadow-sm",
                      msg.role === 'user' 
                        ? "bg-slate-900 text-white rounded-tr-none" 
                        : "bg-slate-50 text-slate-700 rounded-tl-none border border-slate-100"
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-50 p-5 rounded-[1.5rem] rounded-tl-none border border-slate-100">
                      <div className="flex gap-1.5">
                        <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" />
                        <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 md:p-8 bg-slate-50/30 border-t border-slate-50">
                <div className="flex gap-2 md:gap-4">
                  <input 
                    type="text" 
                    placeholder="Escribe un mensaje..." 
                    className="flex-1 px-6 md:px-8 py-4 bg-white border border-slate-100 rounded-[1.5rem] outline-none focus:ring-4 focus:ring-slate-100 transition-all shadow-sm text-sm font-medium"
                    value={inputMessage}
                    onChange={e => setInputMessage(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && sendMessage()}
                  />
                  <button 
                    onClick={sendMessage}
                    className="w-14 h-14 bg-slate-900 text-white rounded-[1.5rem] flex items-center justify-center hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 shrink-0"
                  >
                    <ChevronRight className="w-7 h-7" />
                  </button>
                </div>
              </div>
            </motion.section>
          )}

        </div>
      </main>
      </div>
      )}
    </div>
  );
}
