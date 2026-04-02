import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
  Square, 
  FileText, 
  Map as MapIcon, 
  CheckCircle2, 
  BrainCircuit, 
  ChevronRight,
  History,
  Trash2,
  Download,
  Plus,
  Users,
  Settings,
  BookOpen,
  Upload,
  LogOut,
  Search,
  LayoutDashboard,
  Trophy
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { 
  auth, 
  db, 
  signIn, 
  logOut, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  orderBy,
  getDocs,
  deleteDoc,
  limit
} from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker - using a more robust CDN URL for version 5.x
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// Types
type UserRole = 'teacher' | 'student' | 'admin';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // We don't throw here to avoid crashing the whole app, but we log it clearly
  return errInfo;
}

interface User {
  uid: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  email: string;
}

interface RoadmapNode {
  label: string;
  details?: string;
  children?: RoadmapNode[];
}

interface AnalysisResult {
  transcript: string;
  summary: string;
  roadmap: string;
  roadmapData: RoadmapNode;
  startPage?: number; // The starting page number of the analyzed range
  pageImages?: string[]; // Actual images of the book pages
  feedback?: {
    accuracy: string;
    errors: string[];
    relevanceScore: number;
    suggestions: string;
  };
  tests: {
    question: string;
    options: string[];
    correctAnswer: number;
  }[];
  quizScore?: {
    correct: number;
    total: number;
    completedAt: string;
  };
}

interface Session {
  id: string;
  userId: string;
  userFullName: string;
  title: string;
  date: string;
  type: 'audio' | 'pdf';
  result: AnalysisResult;
}

import * as d3 from 'd3-hierarchy';
import { linkHorizontal } from 'd3-shape';

// MindMap Component
const MindMap = ({ data }: { data: RoadmapNode }) => {
  const [selectedNode, setSelectedNode] = useState<RoadmapNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([data.label]));
  
  const width = 800;
  const height = 400;
  const margin = { top: 20, right: 120, bottom: 20, left: 120 };

  const toggleNode = (label: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(label)) {
      newExpanded.delete(label);
    } else {
      newExpanded.add(label);
    }
    setExpandedNodes(newExpanded);
  };

  const expandAll = () => {
    const allLabels = new Set<string>();
    const traverse = (node: RoadmapNode) => {
      allLabels.add(node.label);
      node.children?.forEach(traverse);
    };
    traverse(data);
    setExpandedNodes(allLabels);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set([data.label]));
  };

  // Filter data based on expanded nodes
  const getVisibleData = (node: RoadmapNode): any => {
    if (!expandedNodes.has(node.label)) {
      return { ...node, children: [] };
    }
    return {
      ...node,
      children: node.children?.map(getVisibleData)
    };
  };

  const visibleData = getVisibleData(data);
  const root = d3.hierarchy(visibleData);
  const treeLayout = d3.tree<RoadmapNode>().size([height - margin.top - margin.bottom, width - margin.left - margin.right]);
  treeLayout(root);

  const linkGenerator = linkHorizontal<any, any>()
    .x(d => d.y)
    .y(d => d.x);

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button 
          onClick={expandAll}
          className="text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 transition-all"
        >
          Hammasini yoyish
        </button>
        <button 
          onClick={collapseAll}
          className="text-[10px] font-bold text-gray-500 hover:text-gray-600 bg-gray-50 px-3 py-1 rounded-full border border-gray-100 transition-all"
        >
          Yig'ish
        </button>
      </div>
      <div id="mindmap-container" className="w-full overflow-x-auto bg-white rounded-2xl p-4 border border-gray-100 relative">
        <svg width={width} height={height} className="mx-auto">
          <g transform={`translate(${margin.left},${margin.top})`}>
            {/* Links */}
            {root.links().map((link, i) => (
              <path
                key={i}
                d={linkGenerator(link) || ""}
                fill="none"
                stroke="#E5E7EB"
                strokeWidth="2"
                className="transition-all duration-500"
              />
            ))}
            
            {/* Nodes */}
            {root.descendants().map((node, i) => (
              <g key={i} transform={`translate(${node.y},${node.x})`}>
                <circle
                  r={4}
                  fill={node.depth === 0 ? "#F97316" : "#3B82F6"}
                  className="cursor-pointer"
                  onClick={() => toggleNode(node.data.label)}
                />
                <foreignObject
                  x={-80}
                  y={-20}
                  width={160}
                  height={40}
                  className="overflow-visible"
                >
                  <div 
                    onClick={() => setSelectedNode(node.data)}
                    className={cn(
                      "flex items-center justify-center text-center px-3 py-2 rounded-xl text-[10px] font-bold border transition-all duration-300 cursor-pointer hover:scale-105 active:scale-95",
                      node.depth === 0 ? "shadow-lg" : ""
                    )}
                    style={{
                      backgroundColor: node.depth === 0 ? "#F97316" : node.depth === 1 ? "#EFF6FF" : "#FFFFFF",
                      color: node.depth === 0 ? "#FFFFFF" : node.depth === 1 ? "#1D4ED8" : "#4B5563",
                      borderColor: node.depth === 0 ? "#EA580C" : node.depth === 1 ? "#BFDBFE" : "#E5E7EB",
                    }}
                  >
                    {node.data.label}
                    {node.data.children && node.data.children.length > 0 && (
                      <div className="ml-1 opacity-50">
                        {expandedNodes.has(node.data.label) ? "−" : "+"}
                      </div>
                    )}
                  </div>
                </foreignObject>
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* Node Details Modal */}
      <AnimatePresence>
        {selectedNode && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl p-8 shadow-2xl max-w-lg w-full space-y-4 relative"
            >
              <button 
                onClick={() => setSelectedNode(null)}
                className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <Plus className="rotate-45 text-gray-400" size={24} />
              </button>
              
              <div className="flex items-center gap-3 text-orange-500 mb-2">
                <BrainCircuit size={32} />
                <h3 className="text-2xl font-bold">{selectedNode.label}</h3>
              </div>
              
              <div className="prose prose-sm text-gray-600 leading-relaxed">
                {selectedNode.details || "Ushbu bo'lim haqida batafsil ma'lumot mavjud emas."}
              </div>

              {selectedNode.children && selectedNode.children.length > 0 && (
                <div className="pt-4 border-t border-gray-100">
                  <h4 className="text-sm font-bold text-gray-400 uppercase mb-3">Kichik bo'limlar</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedNode.children.map((child, i) => (
                      <span key={i} className="px-3 py-1 bg-gray-50 text-gray-600 rounded-full text-xs font-medium border border-gray-200">
                        {child.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Quiz Component
const Quiz = ({ tests, onComplete }: { tests: AnalysisResult['tests'], onComplete?: (score: { correct: number, total: number }) => void }) => {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState<Record<number, boolean>>({});
  const [isFinished, setIsFinished] = useState(false);

  const handleSelect = (questionIdx: number, optionIdx: number) => {
    if (showResults[questionIdx] || isFinished) return;
    setSelectedAnswers(prev => ({ ...prev, [questionIdx]: optionIdx }));
  };

  const checkAnswer = (questionIdx: number) => {
    if (selectedAnswers[questionIdx] === undefined) return;
    setShowResults(prev => ({ ...prev, [questionIdx]: true }));
  };

  const finishQuiz = () => {
    const correctCount = tests.reduce((acc, test, idx) => {
      return acc + (selectedAnswers[idx] === test.correctAnswer ? 1 : 0);
    }, 0);
    
    setIsFinished(true);
    if (onComplete) {
      onComplete({ correct: correctCount, total: tests.length });
    }
  };

  const resetQuiz = () => {
    setSelectedAnswers({});
    setShowResults({});
    setIsFinished(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-700">Test Savollari ({tests.length} ta)</h3>
        <button 
          onClick={resetQuiz}
          className="text-sm text-orange-500 hover:text-orange-600 font-semibold flex items-center gap-1"
        >
          <History size={14} />
          Qayta boshlash
        </button>
      </div>
      
      <div className="space-y-6">
        {tests.map((test, idx) => (
          <div key={idx} className="p-6 rounded-2xl bg-gray-50 border border-gray-100 transition-all">
            <h3 className="font-bold text-lg mb-4 flex gap-3">
              <span className="text-orange-500">{idx + 1}.</span>
              {test.question}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {test.options.map((opt, optIdx) => {
                const isSelected = selectedAnswers[idx] === optIdx;
                const isCorrect = optIdx === test.correctAnswer;
                const revealed = showResults[idx] || isFinished;
                
                return (
                  <button 
                    key={optIdx}
                    onClick={() => handleSelect(idx, optIdx)}
                    disabled={revealed}
                    className={cn(
                      "p-4 rounded-xl border transition-all text-sm font-medium text-left flex items-center justify-between group",
                      revealed 
                        ? isCorrect 
                          ? "bg-green-50 border-green-200 text-green-700" 
                          : isSelected 
                            ? "bg-red-50 border-red-200 text-red-700"
                            : "bg-white border-gray-100 text-gray-400"
                        : isSelected
                          ? "bg-orange-50 border-orange-300 text-orange-700 shadow-sm"
                          : "bg-white border-gray-200 text-gray-600 hover:border-orange-200 hover:bg-orange-50/30"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-[10px] border",
                        isSelected ? "bg-orange-500 text-white border-orange-600" : "bg-gray-50 text-gray-400 border-gray-200"
                      )}>
                        {String.fromCharCode(65 + optIdx)}
                      </span>
                      {opt}
                    </span>
                    {revealed && isCorrect && <CheckCircle2 size={16} className="text-green-500" />}
                  </button>
                );
              })}
            </div>
            {!isFinished && !showResults[idx] && selectedAnswers[idx] !== undefined && (
              <button 
                onClick={() => checkAnswer(idx)}
                className="mt-4 text-xs bg-orange-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-orange-600 transition-colors"
              >
                Tekshirish
              </button>
            )}
          </div>
        ))}
      </div>

      {!isFinished ? (
        <button 
          onClick={finishQuiz}
          disabled={Object.keys(selectedAnswers).length < tests.length}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 text-white font-bold py-4 rounded-2xl shadow-lg transition-all"
        >
          Testni yakunlash
        </button>
      ) : (
        <div className="bg-green-500 rounded-2xl p-8 text-white text-center space-y-2">
          <div className="text-4xl font-black">
            {tests.reduce((acc, test, idx) => acc + (selectedAnswers[idx] === test.correctAnswer ? 1 : 0), 0)} / {tests.length}
          </div>
          <div className="font-bold opacity-90">Sizning natijangiz</div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('zukko_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isAuthReady, setIsAuthReady] = useState(() => {
    // If we have a cached user, we can consider auth "ready" for the initial render
    return !!localStorage.getItem('zukko_user');
  });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [topicName, setTopicName] = useState('');
  const [loginForm, setLoginForm] = useState({ 
    firstName: '', 
    lastName: '', 
    email: '',
    password: '',
    role: 'student' as UserRole 
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [studentSessions, setStudentSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [view, setView] = useState<'main' | 'dashboard' | 'admin'>('main');
  
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageRange, setPageRange] = useState({ start: 1, end: 5 });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Auth Initialization
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // If we have a cached user, use it immediately to avoid waiting
        const saved = localStorage.getItem('zukko_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.uid === firebaseUser.uid) {
            setUser(parsed);
            setIsAuthReady(true);
            return;
          }
        }

        // Otherwise fetch from Firestore
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as User;
            setUser(userData);
            localStorage.setItem('zukko_user', JSON.stringify(userData));
          } else {
            // New user, need to show the form or create default
            const newUser: User = {
              uid: firebaseUser.uid,
              firstName: firebaseUser.displayName?.split(' ')[0] || 'Foydalanuvchi',
              lastName: firebaseUser.displayName?.split(' ').slice(1).join(' ') || '',
              email: firebaseUser.email || '',
              role: 'student'
            };
            setUser(newUser);
            localStorage.setItem('zukko_user', JSON.stringify(newUser));
            // Also save to Firestore
            await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
          }
        } catch (err) {
          console.error("Error fetching user profile:", err);
        }
      } else {
        setUser(null);
        localStorage.removeItem('zukko_user');
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  // User Persistence
  useEffect(() => {
    if (user) {
      localStorage.setItem('zukko_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('zukko_user');
    }
  }, [user]);

  // Sessions Listener
  useEffect(() => {
    if (!user) {
      setSessions([]);
      setStudentSessions([]);
      return;
    }

    let q;
    const path = 'sessions';
    if (user.role === 'admin') {
      q = query(collection(db, path), orderBy('date', 'desc'), limit(50));
    } else if (user.role === 'teacher') {
      q = query(collection(db, path), orderBy('date', 'desc'), limit(50));
    } else {
      q = query(collection(db, path), where('userId', '==', user.uid), orderBy('date', 'desc'), limit(30));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Session));
      if (user.role === 'student') {
        setSessions(docs);
      } else {
        setSessions(docs.filter(s => s.userId === user.uid));
        setStudentSessions(docs.filter(s => s.userId !== user.uid));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
      setErrorMessage("Ma'lumotlarni yuklashda xatolik yuz berdi. Iltimos, ruxsatlaringizni tekshiring.");
    });

    return () => unsubscribe();
  }, [user]);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await signIn();
    } catch (err) {
      console.error("Login failed:", err);
      setErrorMessage("Kirishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      // For simplicity, we'll just use the form to update the current user profile
      // if they are already authenticated but want to change their name/role
      if (user) {
        const updatedUser = {
          ...user,
          firstName: loginForm.firstName,
          lastName: loginForm.lastName,
          role: loginForm.role
        };
        setUser(updatedUser);
        await setDoc(doc(db, 'users', user.uid), updatedUser);
        localStorage.setItem('zukko_user', JSON.stringify(updatedUser));
      } else {
        // If not authenticated, we'll just set a local user for now (legacy support)
        const newUser: User = {
          uid: 'user_' + Date.now(),
          firstName: loginForm.firstName || 'Foydalanuvchi',
          lastName: loginForm.lastName || '',
          role: loginForm.role,
          email: loginForm.email || 'user@zukko.ai'
        };
        setUser(newUser);
        localStorage.setItem('zukko_user', JSON.stringify(newUser));
      }
    } catch (err) {
      console.error("Login failed:", err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logOut();
    localStorage.removeItem('zukko_user');
    setUser(null);
    setActiveSession(null);
    setView('main');
  };

  const downloadPDF = async () => {
    if (!activeSession || !user) return;

    const pdfDoc = new jsPDF();
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    const pageHeight = pdfDoc.internal.pageSize.getHeight();
    let yPos = 20;

    // Header
    pdfDoc.setFontSize(22);
    pdfDoc.setTextColor(249, 115, 22); // Orange-500
    pdfDoc.text("Zukko AI - Dars Hisoboti", pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 15;
    pdfDoc.setFontSize(12);
    pdfDoc.setTextColor(100);
    pdfDoc.text(`Foydalanuvchi: ${activeSession.userFullName}`, 20, yPos);
    pdfDoc.text(`Sana: ${activeSession.date}`, pageWidth - 20, yPos, { align: 'right' });
    
    yPos += 10;
    pdfDoc.setDrawColor(200);
    pdfDoc.line(20, yPos, pageWidth - 20, yPos);
    
    // Summary
    yPos += 15;
    pdfDoc.setFontSize(16);
    pdfDoc.setTextColor(0);
    pdfDoc.text("1. Dars Mazmuni", 20, yPos);
    yPos += 10;
    pdfDoc.setFontSize(10);
    const summaryLines = pdfDoc.splitTextToSize(activeSession.result.summary.replace(/[#*]/g, ''), pageWidth - 40);
    pdfDoc.text(summaryLines, 20, yPos);
    yPos += (summaryLines.length * 5) + 10;

    // Roadmap (Mind Map Image)
    if (yPos > 200) { pdfDoc.addPage(); yPos = 20; }
    pdfDoc.setFontSize(16);
    pdfDoc.text("2. Yo'l Xaritasi (Mind Map)", 20, yPos);
    yPos += 10;

    const mindmapEl = document.getElementById('mindmap-container');
    if (mindmapEl) {
      try {
        // Find the "Hammasini yoyish" button and click it to ensure full capture
        const expandBtn = mindmapEl.parentElement?.querySelector('button') as HTMLButtonElement;
        if (expandBtn && expandBtn.innerText.includes('Hammasini yoyish')) {
          expandBtn.click();
          // Wait for expansion animation
          await new Promise(r => setTimeout(r, 500));
        }

        const canvas = await html2canvas(mindmapEl, { 
          scale: 2,
          useCORS: true,
          backgroundColor: "#FFFFFF",
          logging: false
        });
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = pageWidth - 40;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        if (yPos + imgHeight > 280) { pdfDoc.addPage(); yPos = 20; }
        pdfDoc.addImage(imgData, 'PNG', 20, yPos, imgWidth, imgHeight);
        yPos += imgHeight + 15;
      } catch (err) {
        console.error("Mindmap capture failed", err);
        pdfDoc.setFontSize(10);
        pdfDoc.text("Mind map rasmga olinmadi.", 20, yPos);
        yPos += 10;
      }
    }

    // Teacher Feedback (if exists)
    if (activeSession.result.feedback) {
      if (yPos > 250) { pdfDoc.addPage(); yPos = 20; }
      pdfDoc.setFontSize(16);
      pdfDoc.setTextColor(0, 102, 204); // Blue
      pdfDoc.text("3. O'qituvchi uchun tahlil", 20, yPos);
      yPos += 10;
      pdfDoc.setFontSize(10);
      pdfDoc.setTextColor(0);
      pdfDoc.text(`Mavzu doirasida aniqlik: ${activeSession.result.feedback.relevanceScore}%`, 20, yPos);
      yPos += 7;
      const feedbackLines = pdfDoc.splitTextToSize(`Xulosa: ${activeSession.result.feedback.accuracy}`, pageWidth - 40);
      pdfDoc.text(feedbackLines, 20, yPos);
      yPos += (feedbackLines.length * 5) + 5;
      
      if (activeSession.result.feedback.errors.length > 0) {
        pdfDoc.text("Topilgan xatolar:", 20, yPos);
        yPos += 5;
        activeSession.result.feedback.errors.forEach(err => {
          const errLines = pdfDoc.splitTextToSize(`• ${err}`, pageWidth - 50);
          pdfDoc.text(errLines, 25, yPos);
          yPos += (errLines.length * 5);
        });
      }
      yPos += 5;
    }

    // Quiz Results (if exists)
    if (activeSession.result.quizScore) {
      if (yPos > 250) { pdfDoc.addPage(); yPos = 20; }
      pdfDoc.setFontSize(16);
      pdfDoc.setTextColor(34, 197, 94); // Green
      pdfDoc.text("4. Test Natijasi", 20, yPos);
      yPos += 10;
      pdfDoc.setFontSize(12);
      pdfDoc.setTextColor(0);
      pdfDoc.text(`Natija: ${activeSession.result.quizScore.correct} / ${activeSession.result.quizScore.total}`, 20, yPos);
      yPos += 15;
    }

    // Tests
    if (!(user.role === 'teacher' && activeSession.type === 'pdf') && activeSession.result.tests && activeSession.result.tests.length > 0) {
      if (yPos > 250) { pdfDoc.addPage(); yPos = 20; }
      pdfDoc.setFontSize(16);
      pdfDoc.setTextColor(0);
      pdfDoc.text("5. Test Savollari", 20, yPos);
      yPos += 10;
      pdfDoc.setFontSize(10);
      activeSession.result.tests.forEach((test, i) => {
        if (yPos > 270) { pdfDoc.addPage(); yPos = 20; }
        pdfDoc.setFont(undefined, 'bold');
        pdfDoc.text(`${i + 1}. ${test.question}`, 20, yPos);
        yPos += 7;
        pdfDoc.setFont(undefined, 'normal');
        test.options.forEach((opt, j) => {
          pdfDoc.text(`   ${String.fromCharCode(65 + j)}) ${opt}`, 25, yPos);
          yPos += 5;
        });
        yPos += 5;
      });
    }

    // Transcript (Actual Book Pages Text)
    if (activeSession.result.transcript) {
      if (yPos > 250) { pdfDoc.addPage(); yPos = 20; }
      pdfDoc.setFontSize(16);
      pdfDoc.setTextColor(0);
      pdfDoc.text("6. Kitob Matni (Tanlangan betlar)", 20, yPos);
      yPos += 10;
      pdfDoc.setFontSize(8);
      const transcriptLines = pdfDoc.splitTextToSize(activeSession.result.transcript, pageWidth - 40);
      pdfDoc.text(transcriptLines, 20, yPos);
      yPos += (transcriptLines.length * 4) + 10;
    }

    // Actual Book Page Images (at the very end)
    if (activeSession.result.pageImages && activeSession.result.pageImages.length > 0) {
      const startPage = activeSession.result.startPage || 1;
      
      activeSession.result.pageImages.forEach((img, idx) => {
        pdfDoc.addPage();
        
        // Calculate aspect ratio to avoid distortion
        // Standard A4 is ~210x297mm. Most books are similar.
        // We'll try to fit the image while maintaining its proportions.
        try {
          // We don't have the original dimensions here easily without loading the image,
          // but we can assume a standard book aspect ratio or just use a safe margin.
          const imgMargin = 10;
          const availableWidth = pageWidth - (imgMargin * 2);
          const availableHeight = pageHeight - (imgMargin * 3); // Extra space for caption
          
          // Add the image
          pdfDoc.addImage(img, 'JPEG', imgMargin, imgMargin, availableWidth, availableHeight, undefined, 'FAST');
          
          // Add a clear caption with the actual book page number
          const actualBookPage = startPage + idx;
          pdfDoc.setFontSize(12);
          pdfDoc.setTextColor(100);
          pdfDoc.setFont(undefined, 'bold');
          pdfDoc.text(`Kitobning asl nusxasi: ${actualBookPage}-bet`, pageWidth / 2, pageHeight - 15, { align: 'center' });
          
          // Add a decorative border around the "screenshot"
          pdfDoc.setDrawColor(200);
          pdfDoc.setLineWidth(0.5);
          pdfDoc.rect(imgMargin, imgMargin, availableWidth, availableHeight);
          
        } catch (e) {
          console.error("Failed to add image to PDF:", e);
        }
      });
    }

    pdfDoc.save(`ZukkoAI_${activeSession.title.replace(/\s+/g, '_')}.pdf`);
  };

  const startRecording = async () => {
    if (!topicName.trim()) {
      setErrorMessage("Iltimos, avval dars mavzusini kiriting.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await analyzeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setErrorMessage("Mikrofonga ruxsat berilmadi.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const cleanJSON = (text: string) => {
    try {
      // Remove any potential markdown wrapping
      const cleaned = text.replace(/```json\n?|```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      // Fallback: try to find the first '{' and last '}'
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        try {
          return JSON.parse(text.substring(start, end + 1));
        } catch (e2) {
          throw e; // Throw original error if fallback fails
        }
      }
      throw e;
    }
  };

  const analyzePDF = async () => {
    if (!pdfFile || !user) return;
    setIsAnalyzing(true);
    setErrorMessage(null);
    
    try {
      // 1. Get PDF info and extract text/images
      const arrayBuffer = await pdfFile.arrayBuffer();
      let pdf;
      let extractedText = "";
      let pageImages: string[] = [];
         try {
        pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let start = Math.max(1, pageRange.start);
        let end = Math.min(pdf.numPages, pageRange.end);
        
        // Ensure at least 4 pages if possible (as requested)
        if (end - start < 3 && pdf.numPages >= 4) {
          if (start + 3 <= pdf.numPages) {
            end = start + 3;
          } else {
            start = Math.max(1, pdf.numPages - 3);
            end = pdf.numPages;
          }
        }

        // Limit to 4 images to stay within Firestore 1MB limit (as requested "kamida 4 ta")
        const maxImages = 4;
        const pagesToCapture = [];
        for (let i = start; i <= end; i++) {
          pagesToCapture.push(i);
          if (pagesToCapture.length >= maxImages) break;
        }

        for (const pageNum of pagesToCapture) {
          const page = await pdf.getPage(pageNum);
          
          // Extract text for fallback/search
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          extractedText += `--- Page ${pageNum} ---\n${pageText}\n\n`;

          // Capture page image for the report
          // Use scale 0.6 and quality 0.2 to ensure we stay under 1MB Firestore limit for multiple pages
          const viewport = page.getViewport({ scale: 0.6 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (context) {
            try {
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              await page.render({ canvasContext: context, viewport }).promise;
              // Use scale 0.6 and quality 0.2 to ensure we stay under 1MB Firestore limit for multiple pages
              const dataUrl = canvas.toDataURL('image/jpeg', 0.2);
              pageImages.push(dataUrl);
            } catch (imgErr) {
              console.error("Failed to capture page image:", imgErr);
            }
          }
        }

        // Update start/end for the AI prompt to reflect actual captured range
        const actualStart = start;
        const actualEnd = end;

        // 2. Convert PDF to base64 to send directly to Gemini
        // Limit PDF size to 15MB for Gemini request
        if (pdfFile.size > 15 * 1024 * 1024) {
          throw new Error("PDF fayl hajmi juda katta (maksimal 15MB). Iltimos, kichikroq fayl yuklang.");
        }

        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(pdfFile);
        });

        const prompt = `
          Siz "Zukko AI" - o'qituvchilar va talabalar uchun professional tahlilchisiz. 
          Iltimos, ilova qilingan PDF hujjatining ${actualStart}-betidan ${actualEnd}-betigacha bo'lgan qismini qat'iy tahlil qiling.
          
          Tahlil quyidagi talablarga javob berishi shart:
          1. **Qismlarga bo'lingan (Step-by-step)**: Har bir mavzu va tushunchani qadamma-qadam tushuntiring.
          2. **Aniq va tushunarli**: Murakkab terminlarni sodda tilda izohlang.
          3. **Mantiqiy izchillik**: Ma'lumotlar bir-biri bilan bog'langan bo'lsin.
          
          Quyidagi formatda JSON javob qaytaring:
          {
            "transcript": "Ushbu qismning mazmuni haqida qisqacha ma'lumot",
            "summary": "Kitobning ushbu qismi batafsil tahlili (Markdown formatida). Har bir bo'limni alohida sarlavhalar bilan yozing. Tahlil professional va o'quvchi uchun foydali bo'lsin.",
            "roadmap": "Ushbu qism bo'yicha o'rganish yo'l xaritasi",
            "roadmapData": {
              "label": "Asosiy Mavzu",
              "details": "Mavzu haqida umumiy tushuntirish",
              "children": [
                {
                  "label": "1-Qadam: ...",
                  "details": "Ushbu qadamning batafsil tavsifi",
                  "children": [
                    { "label": "Tushuncha 1.1", "details": "Aniq tushuncha va ma'lumot" }
                  ]
                }
              ]
            },
            "feedback": {
              "accuracy": "Ma'lumotlarning aniqligi haqida xulosa",
              "errors": ["Topilgan xatolar yoki kamchiliklar ro'yxati"],
              "relevanceScore": 100,
              "suggestions": "O'qituvchi uchun metodik tavsiyalar"
            },
            "tests": []
          }
          
          Javob faqat JSON bo'lishi kerak. O'zbek tilida javob bering.
          
          MUHIM:
          1. ${user.role === 'teacher' ? "O'qituvchi uchun tahlil qilinmoqda, shuning uchun TESTLAR YARATMANG (tests: [] bo'lsin)." : "Testlar soni 10-15 ta bo'lsin."}
          2. Mind map (roadmapData) uchun har bir tugun (node) uchun "details" maydonini to'ldiring.
          3. Tahlil qisqa bo'lmasin, har bir tushuncha qismlarga bo'lingan holda aniq yoritilsin.
        `;

        const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
        const response = await genAI.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType: "application/pdf", data: base64Data } }
              ]
            }
          ],
          config: { responseMimeType: "application/json" }
        });

        if (!response.text) throw new Error("AI javob qaytarmadi");

        const result = cleanJSON(response.text) as AnalysisResult;
        
        // Store extracted text, images and start page
        result.startPage = actualStart;
        if (extractedText) result.transcript = extractedText;
        if (pageImages.length > 0) {
          // Limit to 8 images to stay under 1MB Firestore limit
          result.pageImages = pageImages.slice(0, 8);
        }

        const sessionId = Date.now().toString();
        const newSession: Session & { createdAt: string } = {
          id: sessionId,
          userId: user.uid,
          userFullName: `${user.firstName} ${user.lastName}`,
          title: `Kitob Tahlili: ${pdfFile.name} (${actualStart}-${actualEnd}-betlar)`,
          date: new Date().toLocaleString(),
          type: 'pdf',
          result,
          createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'sessions', sessionId), newSession);
        setActiveSession(newSession as Session);
        setPdfFile(null);
      } catch (pdfErr) {
        console.error("PDF analysis or saving failed:", pdfErr);
        throw pdfErr;
      }
    } catch (err) {
      console.error("PDF Analysis failed:", err);
      handleFirestoreError(err, OperationType.CREATE, 'sessions');
      if (err instanceof Error && err.message.includes('juda katta')) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("PDF tahlil qilishda xatolik yuz berdi. Fayl hajmi yoki betlar soni juda ko'p bo'lishi mumkin. Iltimos, kichikroq qismni tanlang.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeAudio = async (blob: Blob) => {
    if (!user) return;
    setIsAnalyzing(true);
    try {
      // Convert blob to base64 robustly
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      const prompt = `
        Siz "Zukko AI" - o'qituvchilar va talabalar uchun aqlli yordamchisiz. 
        Mavzu: "${topicName}"
        
        Vazifangiz:
        1. Ushbu audio darsni tahlil qiling va uni tizimli ko'rinishga keltiring.
        2. Nutqning kiritilgan mavzuga ("${topicName}") qanchalik mos kelishini tekshiring. 
        3. Agar talaba mavzudan chetga chiqqan bo'lsa yoki noto'g'ri ma'lumot bergan bo'lsa, buni "feedback" qismida alohida ta'kidlang.
        
        Quyidagi formatda JSON javob qaytaring:
        {
          "transcript": "Darsning to'liq matni",
          "summary": "Darsning qisqacha mazmuni (Markdown formatida). Tahlil aniq va tushunarli bo'lsin.",
          "roadmap": "Darsning yo'l xaritasi",
          "roadmapData": {
            "label": "${topicName}",
            "details": "Mavzu haqida qisqacha tushuntirish",
            "children": [
              {
                "label": "Asosiy bo'lim 1",
                "details": "Ushbu bo'limning batafsil tavsifi",
                "children": [
                  { "label": "Kichik mavzu 1.1", "details": "Aniq tushuncha va ma'lumot" }
                ]
              }
            ]
          },
          "feedback": {
            "accuracy": "Talabaning nutqi "${topicName}" mavzusiga qanchalik mos va aniq?",
            "errors": ["Mavzudan chetga chiqishlar yoki xatolar"],
            "relevanceScore": 0-100 gacha ball (mavzuga moslik),
            "suggestions": "Mavzuni yaxshiroq yoritish uchun tavsiyalar"
          },
          "tests": [
            {
              "question": "Savol matni",
              "options": ["A variant", "B variant", "C variant", "D variant"],
              "correctAnswer": 0
            }
          ]
        }
        Javob faqat JSON bo'lishi kerak. O'zbek tilida javob bering.
        
        MUHIM: 
        1. Testlar soni darsning davomiyligi va ma'lumotlar ko'pligiga qarab 5 tadan 30 tagacha bo'lsin. 
        2. Nutq mavzudan chetga chiqqan bo'lsa, relevanceScore past bo'lsin va feedbackda tushuntirilsin.
        3. Mind map (roadmapData) uchun har bir tugun (node) uchun "details" maydonini to'ldiring.
        4. Tahlil qisqa bo'lmasin, har bir tushuncha aniq yoritilsin.
      `;

      // Initialize AI inside the function to ensure fresh instance
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      
      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "audio/webm", data: base64Data } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      if (!response.text) {
        throw new Error("AI javob qaytarmadi");
      }

      const result = cleanJSON(response.text) as AnalysisResult;
      const sessionId = Date.now().toString();
      const newSession: Session & { createdAt: string } = {
        id: sessionId,
        userId: user.uid,
        userFullName: `${user.firstName} ${user.lastName}`,
        title: topicName || `Audio Dars: ${new Date().toLocaleDateString()}`,
        date: new Date().toLocaleString(),
        type: 'audio',
        result,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'sessions', sessionId), newSession);
      setActiveSession(newSession as Session);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'sessions');
      setErrorMessage("Tahlil qilishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(id);
  };

  const executeDelete = async () => {
    if (!confirmDelete || !user) return;
    const id = confirmDelete;
    
    try {
      const sessionRef = doc(db, 'sessions', id);
      const sessionSnap = await getDoc(sessionRef);
      
      if (sessionSnap.exists()) {
        const sessionData = sessionSnap.data() as Session;
        if (sessionData.userId === user.uid || user.role === 'admin') {
          await deleteDoc(sessionRef);
          if (activeSession?.id === id) setActiveSession(null);
        } else {
          setErrorMessage("Sizda ushbu darsni o'chirish huquqi yo'q.");
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `sessions/${id}`);
      setErrorMessage("O'chirishda xatolik yuz berdi.");
    } finally {
      setConfirmDelete(null);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-orange-500 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-orange-500 flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full space-y-8"
        >
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg">
              <BrainCircuit size={40} />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Zukko AI</h1>
            <p className="text-gray-500">Ismingizni kiriting va boshlang</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 ml-1">Ism</label>
                <input 
                  required
                  type="text"
                  placeholder="Ism"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition-all"
                  value={loginForm.firstName}
                  onChange={e => setLoginForm(prev => ({ ...prev, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 ml-1">Familiya</label>
                <input 
                  required
                  type="text"
                  placeholder="Familiya"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition-all"
                  value={loginForm.lastName}
                  onChange={e => setLoginForm(prev => ({ ...prev, lastName: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700 ml-1">Siz kimsiz?</label>
              <div className="grid grid-cols-2 gap-2">
                {(['student', 'teacher'] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setLoginForm(prev => ({ ...prev, role: r }))}
                    className={cn(
                      "py-3 rounded-xl border font-bold transition-all",
                      loginForm.role === r 
                        ? "bg-orange-500 text-white border-orange-600 shadow-md" 
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                    )}
                  >
                    {r === 'student' ? 'Talaba' : 'O\'qituvchi'}
                  </button>
                ))}
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <BrainCircuit size={20} />
              {isLoggingIn ? 'Yuklanmoqda...' : 'Boshlash'}
            </button>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Yoki</span>
              </div>
            </div>

            <button 
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoggingIn}
              className="w-full bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-bold py-4 rounded-xl shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google orqali kirish
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-orange-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-200">
            <BrainCircuit size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Zukko <span className="text-orange-500">AI</span></h1>
          
          <nav className="ml-8 hidden md:flex items-center gap-1">
            <button 
              onClick={() => setView('main')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                view === 'main' ? "bg-orange-50 text-orange-600" : "text-gray-500 hover:bg-gray-50"
              )}
            >
              <BookOpen size={18} />
              Darslar
            </button>
            {user.role !== 'student' && (
              <button 
                onClick={() => setView('dashboard')}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                  view === 'dashboard' ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:bg-gray-50"
                )}
              >
                <LayoutDashboard size={18} />
                Talabalar Ishi
              </button>
            )}
            {user.role === 'admin' && (
              <button 
                onClick={() => setView('admin')}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                  view === 'admin' ? "bg-purple-50 text-purple-600" : "text-gray-500 hover:bg-gray-50"
                )}
              >
                <Settings size={18} />
                Admin Panel
              </button>
            )}
          </nav>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">{user.firstName} {user.lastName}</span>
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                user.role === 'teacher' ? "bg-blue-100 text-blue-700" : 
                user.role === 'admin' ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-700"
              )}>
                {user.role === 'teacher' ? 'Ustoz' : user.role === 'admin' ? 'Admin' : 'Talaba'}
              </span>
            </div>
            <button onClick={handleLogout} className="text-[10px] text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1">
              <LogOut size={10} />
              Chiqish
            </button>
          </div>
          {isRecording ? (
            <div className="flex items-center gap-4 bg-red-50 px-4 py-2 rounded-full border border-red-100">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="font-mono font-medium text-red-600">{formatTime(recordingTime)}</span>
              <button 
                onClick={stopRecording}
                className="p-1 hover:bg-red-100 rounded-full transition-colors text-red-600"
              >
                <Square size={20} fill="currentColor" />
              </button>
            </div>
          ) : (
            <button 
              onClick={startRecording}
              disabled={isAnalyzing}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-full font-semibold transition-all shadow-lg shadow-orange-200 active:scale-95"
            >
              <Mic size={20} />
              Darsni yozish
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        <AnimatePresence>
          {errorMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <BrainCircuit className="text-red-500" size={20} />
                <span className="text-sm font-medium">{errorMessage}</span>
              </div>
              <button onClick={() => setErrorMessage(null)} className="p-1 hover:bg-red-100 rounded-full">
                <Plus className="rotate-45" size={20} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {confirmDelete && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white rounded-3xl p-8 shadow-2xl max-w-sm w-full text-center space-y-6"
              >
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
                  <Trash2 size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">O'chirishni tasdiqlang</h3>
                  <p className="text-gray-500 text-sm mt-2">Ushbu darsni o'chirmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi.</p>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setConfirmDelete(null)}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    Bekor qilish
                  </button>
                  <button 
                    onClick={executeDelete}
                    className="flex-1 px-4 py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 shadow-lg shadow-red-100 transition-all"
                  >
                    O'chirish
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {view === 'main' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Sidebar - History */}
            <aside className="lg:col-span-3 space-y-6">
              {user.role === 'teacher' && (
                <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-blue-600 font-bold text-sm uppercase tracking-wider">
                    <BookOpen size={16} />
                    Kitob Yuklash
                  </div>
                  <div className="space-y-3">
                    <div className="relative group">
                      <input 
                        type="file" 
                        accept=".pdf"
                        onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className={cn(
                        "p-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 transition-all",
                        pdfFile ? "border-blue-500 bg-blue-50" : "border-gray-200 group-hover:border-blue-400 group-hover:bg-gray-50"
                      )}>
                        <Upload size={24} className={pdfFile ? "text-blue-500" : "text-gray-400"} />
                        <span className="text-[10px] font-bold text-center truncate w-full">
                          {pdfFile ? pdfFile.name : "PDF tanlang"}
                        </span>
                      </div>
                    </div>
                    
                    {pdfFile && (
                      <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                        <p className="text-[10px] text-blue-600 font-bold bg-blue-50 p-2 rounded-lg">
                          Maslahat: Kamida 4 ta sahifani tanlang (masalan: 1-4)
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-500">Boshlash</label>
                            <input 
                              type="number" 
                              value={pageRange.start}
                              onChange={e => setPageRange(prev => ({ ...prev, start: parseInt(e.target.value) }))}
                              className="w-full px-2 py-1.5 text-xs border rounded-lg"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-500">Tugash</label>
                            <input 
                              type="number" 
                              value={pageRange.end}
                              onChange={e => setPageRange(prev => ({ ...prev, end: parseInt(e.target.value) }))}
                              className="w-full px-2 py-1.5 text-xs border rounded-lg"
                            />
                          </div>
                        </div>
                        <button 
                          onClick={analyzePDF}
                          disabled={isAnalyzing}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl text-xs font-bold shadow-md shadow-blue-100 transition-all"
                        >
                          Tahlil qilish
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-gray-500 font-semibold text-sm uppercase tracking-wider">
                  <History size={16} />
                  Mening Tarixim
                </div>
                <div className="space-y-2 max-h-[calc(100vh-400px)] overflow-y-auto pr-2 custom-scrollbar">
                  {sessions.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      Hali darslar yo'q
                    </div>
                  )}
                  {sessions.map(session => (
                    <div
                      key={session.id}
                      onClick={() => setActiveSession(session)}
                      className={cn(
                        "w-full text-left p-3 rounded-xl transition-all group relative cursor-pointer outline-none",
                        activeSession?.id === session.id 
                          ? "bg-orange-50 border-orange-200 text-orange-900 border" 
                          : "hover:bg-gray-50 border border-transparent"
                      )}
                    >
                      <div className="font-semibold truncate pr-6 text-sm">{session.title}</div>
                      <div className="text-[10px] opacity-60 mt-1 flex items-center gap-2">
                        {session.type === 'audio' ? <Mic size={10} /> : <FileText size={10} />}
                        {session.date}
                      </div>
                      <button 
                        onClick={(e) => deleteSession(session.id, e)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 rounded-lg transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            {/* Content Area */}
            <section className="lg:col-span-9 space-y-8">
              <AnimatePresence mode="wait">
                {isAnalyzing ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    key="analyzing"
                    className="bg-white rounded-3xl p-12 border border-gray-200 shadow-sm flex flex-col items-center justify-center text-center space-y-6"
                  >
                    <div className="relative">
                      <div className="w-20 h-20 border-4 border-orange-100 border-t-orange-500 rounded-full animate-spin" />
                      <BrainCircuit className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-orange-500" size={32} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold mb-2">Tahlil qilinmoqda...</h2>
                      <p className="text-gray-500 max-w-md">
                        Sun'iy intellekt ma'lumotlarni o'rganib, yo'l xaritasi va testlarni tayyorlamoqda.
                      </p>
                    </div>
                  </motion.div>
                ) : activeSession ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key="session-details"
                    className="space-y-8"
                  >
                    {/* Session Header */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">{activeSession.title}</h2>
                        <p className="text-sm text-gray-500">Kim tomonidan: {activeSession.userFullName}</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setActiveSession(null);
                            setTopicName('');
                          }}
                          className="flex items-center gap-2 bg-gray-100 text-gray-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all"
                        >
                          <Plus size={18} />
                          Yangi dars
                        </button>
                        <button 
                          onClick={downloadPDF}
                          className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-black transition-all"
                        >
                          <Download size={18} />
                          PDF Yuklash
                        </button>
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                      <div className="flex items-center gap-2 mb-4 text-orange-600 font-bold">
                        <FileText size={20} />
                        Dars Mazmuni
                      </div>
                      <div className="prose prose-sm max-w-none text-gray-700">
                        <Markdown>{activeSession.result.summary}</Markdown>
                      </div>
                    </div>

                    {/* Mind Map Roadmap */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                      <div className="flex items-center gap-2 mb-6 text-blue-600 font-bold text-xl">
                        <MapIcon size={24} />
                        Darsning Yo'l Xaritasi (Mind Map)
                      </div>
                      <div className="mb-4 text-xs text-gray-400 italic">
                        * Tugunlarni bosish orqali batafsil ma'lumot olishingiz mumkin.
                      </div>
                      {activeSession.result.roadmapData ? (
                        <MindMap data={activeSession.result.roadmapData} />
                      ) : (
                        <div className="prose prose-sm max-w-none text-gray-700">
                          <Markdown>{activeSession.result.roadmap}</Markdown>
                        </div>
                      )}
                    </div>

                    {/* Teacher Feedback Section */}
                    {user?.role === 'teacher' && activeSession.result.feedback && (
                      <div className="bg-blue-50 rounded-3xl p-8 border border-blue-100">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600">
                            <BrainCircuit size={24} />
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-blue-900">O'qituvchi uchun tahlil</h2>
                            <p className="text-sm text-blue-600">Talaba nutqi va bilimining sun'iy intellekt tahlili</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div className="bg-white p-4 rounded-2xl border border-blue-100">
                              <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Mavzu doirasida aniqlik</h4>
                              <div className="flex items-center gap-4">
                                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-blue-500 transition-all duration-1000" 
                                    style={{ width: `${activeSession.result.feedback.relevanceScore}%` }}
                                  />
                                </div>
                                <span className="text-lg font-bold text-blue-600">{activeSession.result.feedback.relevanceScore}%</span>
                              </div>
                            </div>
                            
                            <div className="bg-white p-4 rounded-2xl border border-blue-100">
                              <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Xulosa</h4>
                              <p className="text-sm text-gray-700 leading-relaxed">{activeSession.result.feedback.accuracy}</p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="bg-white p-4 rounded-2xl border border-blue-100">
                              <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Topilgan xatolar</h4>
                              <ul className="space-y-2">
                                {activeSession.result.feedback.errors.map((err, i) => (
                                  <li key={i} className="text-sm text-red-600 flex gap-2">
                                    <span className="shrink-0">•</span>
                                    {err}
                                  </li>
                                ))}
                                {activeSession.result.feedback.errors.length === 0 && (
                                  <li className="text-sm text-green-600 flex gap-2">
                                    <span className="shrink-0">✓</span>
                                    Hech qanday xato topilmadi.
                                  </li>
                                )}
                              </ul>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-blue-100">
                              <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Tavsiyalar</h4>
                              <p className="text-sm text-gray-700 italic">{activeSession.result.feedback.suggestions}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Quiz Score in Dashboard for Teacher */}
                    {user?.role === 'teacher' && activeSession.result.quizScore && (
                      <div className="bg-green-50 rounded-3xl p-6 border border-green-100 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center text-green-600">
                            <Trophy size={24} />
                          </div>
                          <div>
                            <h3 className="font-bold text-green-900">Test natijasi</h3>
                            <p className="text-sm text-green-600">Talaba testni yakunladi</p>
                          </div>
                        </div>
                        <div className="text-2xl font-black text-green-600">
                          {activeSession.result.quizScore.correct} / {activeSession.result.quizScore.total}
                        </div>
                      </div>
                    )}

                    {/* Tests */}
                    {!(user.role === 'teacher' && activeSession.type === 'pdf') && activeSession.result.tests && activeSession.result.tests.length > 0 && (
                      <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-2 mb-8 text-green-600 font-bold text-xl">
                          <CheckCircle2 size={24} />
                          Bilimni Tekshirish Testlari
                        </div>
                        <Quiz 
                          tests={activeSession.result.tests} 
                          onComplete={async (score) => {
                            if (activeSession && user) {
                              const sessionRef = doc(db, 'sessions', activeSession.id);
                              await setDoc(sessionRef, {
                                result: {
                                  ...activeSession.result,
                                  quizScore: {
                                    ...score,
                                    completedAt: new Date().toISOString()
                                  }
                                }
                              }, { merge: true });
                            }
                          }}
                        />
                      </div>
                    )}

                    {/* Transcript */}
                    <details className="group bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                      <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-gray-50 transition-all">
                        <div className="flex items-center gap-3 font-bold text-gray-700">
                          <FileText className="text-orange-500" size={20} />
                          Kitobning Asl Betlari va Matni
                        </div>
                        <ChevronRight className="text-gray-400 group-open:rotate-90 transition-transform" size={20} />
                      </summary>
                      <div className="p-6 pt-0 space-y-6 border-t border-gray-100">
                        {activeSession.result.pageImages && activeSession.result.pageImages.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {activeSession.result.pageImages.map((img, idx) => (
                              <div key={idx} className="space-y-2">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sahifa {idx + 1}</p>
                                <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                                  <img src={img} alt={`Page ${idx + 1}`} className="w-full h-auto" referrerPolicy="no-referrer" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded-xl">
                          {activeSession.result.transcript}
                        </div>
                      </div>
                    </details>

                    {/* Business Model Section */}
                    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-8 text-white shadow-xl mt-12">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-orange-500 flex items-center justify-center text-white">
                          <BrainCircuit size={24} />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold">Zukko AI Kelajagi</h2>
                          <p className="text-gray-400 text-sm">Biznes model va kelgusi yangilanishlar</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <h3 className="text-lg font-bold text-orange-500">Hozirgi holat</h3>
                          <p className="text-gray-300 text-sm leading-relaxed">
                            Zukko AI o'qituvchilar va talabalar uchun darslarni avtomatik tahlil qilish va metodik yordam berishga yo'naltirilgan prototip bosqichida. 
                            Tizim real vaqt rejimida darslarni tahlil qiladi, yo'l xaritalarini chizadi va bilimlarni test orqali tekshiradi.
                          </p>
                        </div>
                        <div className="space-y-4">
                          <h3 className="text-lg font-bold text-orange-500">Kelajak rejalari</h3>
                          <ul className="space-y-2 text-gray-300 text-sm">
                            <li className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
                              O'qituvchilar uchun pullik obuna tizimi
                            </li>
                            <li className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
                              Talabalar uchun shaxsiy rivojlanish traektoriyasi
                            </li>
                            <li className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
                              O'quv markazlari uchun CRM integratsiyasi
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key="recording-ui"
                    className="space-y-8"
                  >
                    <div className="bg-white rounded-3xl p-8 shadow-xl border border-orange-100 space-y-6">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-gray-700 ml-1">Dars mavzusi</label>
                          <input 
                            type="text"
                            placeholder="Masalan: O'zbekiston tarixi yoki Matematika"
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition-all"
                            value={topicName}
                            onChange={(e) => setTopicName(e.target.value)}
                            disabled={isRecording}
                          />
                        </div>

                        <div className="flex flex-col items-center justify-center py-10 space-y-6">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={isRecording ? stopRecording : startRecording}
                            className={cn(
                              "w-32 h-32 rounded-full flex items-center justify-center text-white shadow-2xl transition-all relative",
                              isRecording ? "bg-red-500 shadow-red-200" : "bg-orange-500 shadow-orange-200"
                            )}
                          >
                            {isRecording && (
                              <motion.div 
                                initial={{ scale: 1 }}
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ repeat: Infinity, duration: 1.5 }}
                                className="absolute inset-0 bg-red-500 rounded-full opacity-20"
                              />
                            )}
                            {isRecording ? <Square size={48} fill="currentColor" /> : <Mic size={48} />}
                          </motion.button>
                          
                          <div className="text-center space-y-2">
                            <h2 className="text-2xl font-bold text-gray-900">
                              {isRecording ? "Ovoz yozilmoqda..." : "Darsni boshlash"}
                            </h2>
                            <p className="text-gray-500 max-w-xs">
                              {isRecording 
                                ? "Mavzu bo'yicha gapiring. Tugatgandan so'ng to'xtatish tugmasini bosing." 
                                : "Mavzuni kiriting va tugmani bosib gapirishni boshlang."}
                            </p>
                            {isRecording && (
                              <div className="text-3xl font-mono font-bold text-red-500 mt-4">
                                {formatTime(recordingTime)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </div>
        )}

        {view === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">Talabalar Ishi</h2>
                <p className="text-gray-500">Barcha talabalar tomonidan bajarilgan tahlillar</p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Talaba ismini qidirish..."
                  className="pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 outline-none transition-all w-64"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {studentSessions.length === 0 && (
                <div className="col-span-full text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-200 text-gray-400">
                  Hali talabalar tomonidan ishlar bajarilmagan
                </div>
              )}
              {studentSessions.map(session => (
                <motion.div 
                  key={session.id}
                  whileHover={{ y: -5 }}
                  onClick={() => { setActiveSession(session); setView('main'); }}
                  className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      {session.type === 'audio' ? <Mic size={24} /> : <FileText size={24} />}
                    </div>
                    <span className="text-[10px] font-bold text-gray-400">{session.date}</span>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1 truncate">{session.title}</h3>
                  <p className="text-xs text-gray-500 mb-4 flex items-center gap-1">
                    <Users size={12} />
                    {session.userFullName}
                  </p>
                  <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                    <span className="text-[10px] font-bold text-blue-600 uppercase">Ko'rish</span>
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-600 transition-colors" />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {view === 'admin' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="bg-purple-600 rounded-3xl p-8 text-white shadow-xl">
              <h2 className="text-3xl font-bold mb-2">Admin Panel</h2>
              <p className="text-purple-100">Tizimdagi barcha harakatlarni nazorat qilish</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <History size={20} className="text-purple-600" />
                    Oxirgi harakatlar
                  </h3>
                  <div className="space-y-4">
                    {[...sessions, ...studentSessions].slice(0, 10).map(s => (
                      <div key={s.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-lg",
                            s.type === 'audio' ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"
                          )}>
                            {s.type === 'audio' ? <Mic size={16} /> : <FileText size={16} />}
                          </div>
                          <div>
                            <div className="text-sm font-bold">{s.userFullName}</div>
                            <div className="text-[10px] text-gray-500">{s.title}</div>
                          </div>
                        </div>
                        <div className="text-[10px] font-bold text-gray-400">{s.date}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                  <h3 className="font-bold text-lg mb-4">Statistika</h3>
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 rounded-xl">
                      <div className="text-xs text-blue-600 font-bold uppercase">Jami Foydalanuvchilar</div>
                      <div className="text-2xl font-bold text-blue-900">--</div>
                    </div>
                    <div className="p-4 bg-orange-50 rounded-xl">
                      <div className="text-xs text-orange-600 font-bold uppercase">Jami Tahlillar</div>
                      <div className="text-2xl font-bold text-orange-900">{sessions.length + studentSessions.length}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E5E7EB;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #D1D5DB;
        }
      `}</style>
    </div>
  );
}
