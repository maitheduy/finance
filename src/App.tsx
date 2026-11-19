import React, { useState, useEffect } from 'react';
import { 
  Wallet, TrendingUp, TrendingDown, PieChart as PieIcon, Calendar, 
  Settings as SettingsIcon, CreditCard, Sparkles, Download, Upload, 
  LogOut, LogIn, Plus, Trash2, Edit2, CheckCircle, AlertCircle, 
  FileText, Shield, Users, RefreshCw, Search, Filter, Bell, ArrowUpRight, ArrowDownLeft
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend 
} from 'recharts';
import { auth, db, googleProvider, signInWithPopup, signOut } from './firebase';
import { createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, signInWithEmailAndPassword, User as FirebaseUser } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { Transaction, RecurringBill, Budget, AISettings, UserSettings, TransactionType } from './types';
import { categorizeTransactionWithAI } from './aiService';

const DEFAULT_CATEGORIES = {
  expense: ['Ăn uống', 'Nhà ở & Điện nước', 'Đi lại', 'Mua sắm', 'Giải trí', 'Y tế & Sức khỏe', 'Giáo dục', 'Khác'],
  income: ['Lương', 'Thưởng', 'Đầu tư', 'Kinh doanh', 'Thu nhập khác']
};

const DEFAULT_WALLETS = ['Tiền mặt', 'Vietcombank', 'Techcombank', 'MB Bank', 'Momo / ZaloPay', 'Ví chung'];
const DEFAULT_MEMBERS = ['Bố', 'Mẹ', 'Con', 'Chung'];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const defaultSettings: UserSettings = {
    familyMembers: DEFAULT_MEMBERS,
    wallets: DEFAULT_WALLETS,
    categories: DEFAULT_CATEGORIES,
    aiSettings: {
      enabled: true,
      provider: 'gemini',
      apiKey: ''
    }
  };

function storageKey(key: string) {
  const account = auth?.currentUser;
  return account?.emailVerified ? key + ":" + account.uid : key;
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'analytics' | 'bills' | 'reports' | 'bank' | 'settings'>('overview');

  // App Data state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurringBills, setRecurringBills] = useState<RecurringBill[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings>(defaultSettings);

  // UI modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Filters for transactions
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterMember, setFilterMember] = useState<string>('all');

  // Form states for manual transaction
  const [transType, setTransType] = useState<TransactionType>('expense');
  const [transAmount, setTransAmount] = useState<string>('');
  const [transCategory, setTransCategory] = useState<string>(DEFAULT_CATEGORIES.expense[0]);
  const [transDesc, setTransDesc] = useState<string>('');
  const [transDate, setTransDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [transMember, setTransMember] = useState<string>(DEFAULT_MEMBERS[0]);
  const [transWallet, setTransWallet] = useState<string>(DEFAULT_WALLETS[0]);

  // Form states for recurring bill
  const [billTitle, setBillTitle] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billCategory, setBillCategory] = useState(DEFAULT_CATEGORIES.expense[0]);
  const [billDueDate, setBillDueDate] = useState('5');
  const [billFrequency, setBillFrequency] = useState<'monthly' | 'weekly' | 'yearly'>('monthly');

  // Auth observer & Data synchronization
  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      // Load local storage fallback
      loadLocalStorageData();
      return;
    }

    let stopSync: (() => void) | undefined;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      stopSync?.();
      stopSync = undefined;
      const verifiedUser = currentUser?.emailVerified ? currentUser : null;
      setUser(verifiedUser);
      setTransactions([]);
      setRecurringBills([]);
      setBudgets([]);
      setUserSettings(defaultSettings);
      setAuthLoading(false);
      if (verifiedUser && db) {
        // Sync Firestore data for user
        stopSync = syncFirestoreData(verifiedUser.uid);
      } else {
        loadLocalStorageData();
      }
    });

    return () => { unsubscribe(); stopSync?.(); };
  }, []);

  const loadLocalStorageData = () => {
    const localTrans = localStorage.getItem(storageKey('family_finance_transactions'));
    const localBills = localStorage.getItem(storageKey('family_finance_bills'));
    const localSettings = localStorage.getItem(storageKey('family_finance_settings'));
    if (localTrans) setTransactions(JSON.parse(localTrans));
    if (localBills) setRecurringBills(JSON.parse(localBills));
    if (localSettings) setUserSettings(JSON.parse(localSettings));
  };

  const syncFirestoreData = (uid: string) => {
    if (!db) return;
    
    // Transactions listener
    const qTrans = query(collection(db, 'transactions'), where('userId', '==', uid));
    const unsubTrans = onSnapshot(qTrans, (snapshot) => {
      const list: Transaction[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Transaction);
      });
      // Sort by date desc
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(list);
      localStorage.setItem(storageKey('family_finance_transactions'), JSON.stringify(list));
    }, (err) => {
      console.warn('Firestore transactions sync fallback to local:', err);
      loadLocalStorageData();
    });

    // Bills listener
    const qBills = query(collection(db, 'recurringBills'), where('userId', '==', uid));
    const unsubBills = onSnapshot(qBills, (snapshot) => {
      const list: RecurringBill[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as RecurringBill);
      });
      setRecurringBills(list);
      localStorage.setItem(storageKey('family_finance_bills'), JSON.stringify(list));
    }, (err) => {
      console.warn('Firestore bills sync fallback to local:', err);
    });

    return () => {
      unsubTrans();
      unsubBills();
    };
  };

  const handleEmailAuth = async (register: boolean) => {
    if (!auth || emailBusy) return;
    setEmailBusy(true);
    try {
      const address = email.trim();
      const credential = register
        ? await createUserWithEmailAndPassword(auth, address, password)
        : await signInWithEmailAndPassword(auth, address, password);
      if (credential.user.emailVerified) {
        showNotify('Đăng nhập thành công.', 'success');
      } else {
        try {
          await sendEmailVerification(credential.user);
          showNotify('Hãy mở email xác minh, rồi quay lại đăng nhập.', 'success');
        } finally {
          await signOut(auth);
        }
      }
    } catch {
      showNotify('Không thể xác thực. Kiểm tra email, mật khẩu hoặc thử lại sau.', 'error');
    } finally {
      setPassword('');
      setEmailBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!auth) {
      showNotify('Firebase chưa được cấu hình đầy đủ. Chạy ở chế độ ngoại tuyến.', 'error');
      return;
    }
    try {
      await signInWithPopup(auth, googleProvider);
      showNotify('Đăng nhập Google thành công!', 'success');
    } catch (error: any) {
      console.error(error);
      showNotify('Lỗi đăng nhập Google: ' + error.message, 'error');
    }
  };

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
    }
    setUser(null);
    showNotify('Đã đăng xuất thành công.', 'success');
  };

  const showNotify = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Save transaction to Firestore or LocalStorage
  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transAmount || isNaN(Number(transAmount))) {
      showNotify('Vui lòng nhập số tiền hợp lệ.', 'error');
      return;
    }

    const newTrans: Transaction = {
      id: 'tr_' + Date.now() + Math.random().toString(36).substring(2, 7),
      userId: user ? user.uid : 'local_user',
      type: transType,
      amount: Number(transAmount),
      category: transCategory,
      description: transDesc || (transType === 'expense' ? 'Khoản chi tiêu' : 'Khoản thu nhập'),
      date: transDate,
      memberName: transMember,
      wallet: transWallet,
      createdAt: new Date().toISOString()
    };

    if (user && db) {
      try {
        await setDoc(doc(db, 'transactions', newTrans.id), newTrans);
      } catch (err) {
        console.error(err);
        // fallback to local
        const updated = [newTrans, ...transactions];
        setTransactions(updated);
        localStorage.setItem(storageKey('family_finance_transactions'), JSON.stringify(updated));
      }
    } else {
      const updated = [newTrans, ...transactions];
      setTransactions(updated);
      localStorage.setItem(storageKey('family_finance_transactions'), JSON.stringify(updated));
    }

    showNotify('Đã thêm giao dịch thành công!', 'success');
    setIsAddModalOpen(false);
    setTransAmount('');
    setTransDesc('');
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa giao dịch này?')) return;
    if (user && db) {
      try {
        await deleteDoc(doc(db, 'transactions', id));
      } catch (e) {
        console.error(e);
      }
    }
    const updated = transactions.filter(t => t.id !== id);
    setTransactions(updated);
    localStorage.setItem(storageKey('family_finance_transactions'), JSON.stringify(updated));
    showNotify('Đã xóa giao dịch.', 'success');
  };

  // AI Assistant Quick Parse
  const handleAIParsing = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError('');
    try {
      const result = await categorizeTransactionWithAI(
        aiPrompt,
        userSettings.aiSettings,
        userSettings.categories,
        userSettings.familyMembers,
        userSettings.wallets
      );

      // Pre-fill form or auto save
      const newTrans: Transaction = {
        id: 'tr_' + Date.now() + Math.random().toString(36).substring(2, 7),
        userId: user ? user.uid : 'local_user',
        type: result.type,
        amount: Number(result.amount),
        category: result.category || DEFAULT_CATEGORIES.expense[0],
        description: result.description || aiPrompt,
        date: new Date().toISOString().split('T')[0],
        memberName: result.memberName || userSettings.familyMembers[0],
        wallet: result.wallet || userSettings.wallets[0],
        createdAt: new Date().toISOString()
      };

      if (user && db) {
        await setDoc(doc(db, 'transactions', newTrans.id), newTrans);
      } else {
        const updated = [newTrans, ...transactions];
        setTransactions(updated);
        localStorage.setItem(storageKey('family_finance_transactions'), JSON.stringify(updated));
      }

      showNotify(`AI đã phân loại và thêm: ${result.description} (${formatVND(result.amount)})`, 'success');
      setAiPrompt('');
    } catch (err: any) {
      setAiError(err.message || 'Lỗi phân tích AI');
      showNotify(err.message || 'Lỗi phân tích AI', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  // Recurring bills handlers
  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billTitle || !billAmount) return;

    const newBill: RecurringBill = {
      id: 'bill_' + Date.now(),
      userId: user ? user.uid : 'local_user',
      title: billTitle,
      amount: Number(billAmount),
      category: billCategory,
      frequency: billFrequency,
      dueDate: Number(billDueDate),
      status: 'pending'
    };

    if (user && db) {
      try {
        await setDoc(doc(db, 'recurringBills', newBill.id), newBill);
      } catch (e) {
        console.error(e);
      }
    }
    const updated = [...recurringBills, newBill];
    setRecurringBills(updated);
    localStorage.setItem(storageKey('family_finance_bills'), JSON.stringify(updated));
    showNotify('Đã thêm khoản phí cố định!', 'success');
    setIsBillModalOpen(false);
    setBillTitle('');
    setBillAmount('');
  };

  const handleToggleBillStatus = async (bill: RecurringBill) => {
    const updatedStatus: 'pending' | 'paid' = bill.status === 'pending' ? 'paid' : 'pending';
    const updatedBills = recurringBills.map(b => b.id === bill.id ? { ...b, status: updatedStatus, lastPaidDate: updatedStatus === 'paid' ? new Date().toISOString().split('T')[0] : b.lastPaidDate } : b);
    setRecurringBills(updatedBills);
    localStorage.setItem(storageKey('family_finance_bills'), JSON.stringify(updatedBills));
    if (user && db) {
      try {
        await setDoc(doc(db, 'recurringBills', bill.id), { ...bill, status: updatedStatus });
      } catch (e) { console.error(e); }
    }
    showNotify(`Đã cập nhật trạng thái phí: ${bill.title}`, 'success');
  };

  const handleDeleteBill = async (id: string) => {
    const updated = recurringBills.filter(b => b.id !== id);
    setRecurringBills(updated);
    localStorage.setItem(storageKey('family_finance_bills'), JSON.stringify(updated));
    if (user && db) {
      try { await deleteDoc(doc(db, 'recurringBills', id)); } catch (e) {}
    }
    showNotify('Đã xóa khoản phí.', 'success');
  };

  // JSON Export / Import
  const handleExportJSON = () => {
    const data = {
      transactions,
      recurringBills,
      userSettings,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showNotify('Xuất file JSON thành công!', 'success');
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.transactions) setTransactions(json.transactions);
        if (json.recurringBills) setRecurringBills(json.recurringBills);
        if (json.userSettings) setUserSettings(json.userSettings);
        
        localStorage.setItem(storageKey('family_finance_transactions'), JSON.stringify(json.transactions || []));
        localStorage.setItem(storageKey('family_finance_bills'), JSON.stringify(json.recurringBills || []));
        localStorage.setItem(storageKey('family_finance_settings'), JSON.stringify(json.userSettings || userSettings));
        
        showNotify('Nhập dữ liệu từ file JSON thành công!', 'success');
      } catch (err) {
        showNotify('File JSON không hợp lệ!', 'error');
      }
    };
    reader.readAsText(file);
  };

  // Calculations
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const netBalance = totalIncome - totalExpense;

  // Format VND in thousands (e.g., 50 -> 50.000 đ or 50.000 VNĐ)
  const formatVND = (amountInThousands: number) => {
    const fullAmount = amountInThousands * 1000;
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(fullAmount);
  };

  // Chart data calculations
  const expenseByCategory = DEFAULT_CATEGORIES.expense.map(cat => {
    const total = transactions
      .filter(t => t.type === 'expense' && t.category === cat)
      .reduce((sum, t) => sum + t.amount, 0);
    return { name: cat, value: total };
  }).filter(item => item.value > 0);

  // Filtered transactions
  const filteredTransactions = transactions.filter(t => {
    const matchSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase()) || t.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchType = filterType === 'all' || t.type === filterType;
    const matchCat = filterCategory === 'all' || t.category === filterCategory;
    const matchMem = filterMember === 'all' || t.memberName === filterMember;
    return matchSearch && matchType && matchCat && matchMem;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-white flex items-center space-x-2 transition-all ${
          notification.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
        }`}>
          {notification.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span className="font-medium">{notification.message}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 text-white p-2.5 rounded-xl shadow-md flex items-center justify-center">
              <Wallet size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Quản lý Chi tiêu Gia đình & Tài chính
              </h1>
              <p className="text-xs text-slate-500">Đơn vị: ngàn VNĐ (k) • Đồng bộ đa thiết bị</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {user ? (
              <div className="flex items-center space-x-3 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'User'} className="w-8 h-8 rounded-full border" />
                ) : (
                  <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center font-bold text-sm">
                    {user.email?.[0].toUpperCase()}
                  </div>
                )}
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold text-slate-700">{user.displayName || 'Thành viên'}</p>
                  <p className="text-[10px] text-slate-500">{user.email}</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-1.5 text-slate-500 hover:text-rose-600 rounded-lg transition"
                  title="Đăng xuất"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <>
              {auth && (
                <details className="relative">
                  <summary className="cursor-pointer text-sm font-medium">Email</summary>
                  <form className="absolute right-0 top-full mt-2 w-72 max-w-[90vw] space-y-2 rounded-xl border bg-white p-4 shadow-lg"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const button = (event.nativeEvent as SubmitEvent).submitter;
                      void handleEmailAuth(button?.getAttribute('value') === 'register');
                    }}>
                    <label className="block text-sm">Email
                      <input className="w-full rounded border p-2" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
                    </label>
                    <label className="block text-sm">Mật khẩu
                      <input className="w-full rounded border p-2" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} />
                    </label>
                    <div className="flex gap-3">
                      <button type="submit" disabled={emailBusy} className="rounded bg-blue-600 px-3 py-2 text-white">Đăng nhập</button>
                      <button type="submit" value="register" disabled={emailBusy} className="rounded border px-3 py-2">Đăng ký</button>
                    </div>
                  </form>
                </details>
              )}
              <button
                onClick={handleGoogleLogin}
                className="flex items-center space-x-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium px-4 py-2 rounded-xl shadow-xs transition"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span className="text-sm">Đăng nhập Google</span>
              </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 sm:space-x-6 overflow-x-auto py-2">
          {[
            { id: 'overview', label: 'Tổng quan', icon: Wallet },
            { id: 'transactions', label: 'Giao dịch', icon: CreditCard },
            { id: 'analytics', label: 'Biểu đồ', icon: PieIcon },
            { id: 'bills', label: 'Phí cố định', icon: Calendar },
            { id: 'reports', label: 'Báo cáo tháng', icon: FileText },
            { id: 'bank', label: 'Ngân hàng (v2)', icon: Shield, badge: 'Mới' },
            { id: 'settings', label: 'Cài đặt & AI', icon: SettingsIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
                  isActive 
                    ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-xs' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        
        {/* --- TAB 1: OVERVIEW --- */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* AI Assistant Quick Bar */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
              <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4 translate-y-4">
                <Sparkles size={160} />
              </div>
              <div className="relative z-10 max-w-2xl">
                <div className="flex items-center space-x-2 mb-2">
                  <Sparkles className="text-yellow-300 animate-pulse" size={20} />
                  <h2 className="text-lg font-bold">Trợ lý AI phân loại giao dịch tự động</h2>
                </div>
                <p className="text-blue-100 text-sm mb-4">
                  Nhập câu mô tả chi tiêu tự nhiên (Ví dụ: &quot;Sáng nay ăn phở 50k bằng tiền mặt&quot; hoặc &quot;Lương tháng này về 15 triệu&quot;). AI sẽ tự nhận diện loại, danh mục và số tiền.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAIParsing()}
                    placeholder="VD: Mua rau củ siêu thị 150k cho Mẹ..."
                    className="flex-1 bg-white/10 border border-white/30 rounded-xl px-4 py-2.5 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-white/50"
                  />
                  <button
                    onClick={handleAIParsing}
                    disabled={aiLoading}
                    className="bg-white text-blue-700 hover:bg-blue-50 font-bold px-6 py-2.5 rounded-xl shadow transition flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    {aiLoading ? <RefreshCw className="animate-spin" size={18} /> : <Sparkles size={18} />}
                    <span>AI Xử lý</span>
                  </button>
                </div>
                {aiError && <p className="text-rose-200 text-xs mt-2">{aiError}</p>}
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Tổng thu nhập</p>
                  <h3 className="text-2xl font-bold text-emerald-600 mt-1">{formatVND(totalIncome)}</h3>
                </div>
                <div className="bg-emerald-100 text-emerald-600 p-3 rounded-xl">
                  <ArrowDownLeft size={24} />
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Tổng chi tiêu</p>
                  <h3 className="text-2xl font-bold text-rose-600 mt-1">{formatVND(totalExpense)}</h3>
                </div>
                <div className="bg-rose-100 text-rose-600 p-3 rounded-xl">
                  <ArrowUpRight size={24} />
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Số dư hiện tại</p>
                  <h3 className={`text-2xl font-bold mt-1 ${netBalance >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                    {formatVND(netBalance)}
                  </h3>
                </div>
                <div className="bg-blue-100 text-blue-600 p-3 rounded-xl">
                  <Wallet size={24} />
                </div>
              </div>
            </div>

            {/* Quick Actions & Recent Transactions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-slate-800">Giao dịch gần đây</h3>
                  <button 
                    onClick={() => setActiveTab('transactions')}
                    className="text-sm text-blue-600 hover:underline font-medium"
                  >
                    Xem tất cả ({transactions.length})
                  </button>
                </div>

                {transactions.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <CreditCard size={48} className="mx-auto mb-3 opacity-50" />
                    <p>Chưa có giao dịch nào. Hãy thêm giao dịch mới hoặc dùng AI bên trên.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transactions.slice(0, 5).map((t) => (
                      <div key={t.id} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl hover:bg-slate-100 transition">
                        <div className="flex items-center space-x-3">
                          <div className={`p-2.5 rounded-xl ${t.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                            {t.type === 'income' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-800 text-sm">{t.description}</h4>
                            <p className="text-xs text-slate-500">
                              {t.category} • {t.memberName} • {t.wallet} • {t.date}
                            </p>
                          </div>
                        </div>
                        <div className={`font-bold text-sm ${t.type === 'income' ? 'text-emerald-600' : 'text-slate-800'}`}>
                          {t.type === 'income' ? '+' : '-'}{formatVND(t.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Actions Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-800 mb-4">Thao tác nhanh</h3>
                  <div className="space-y-3">
                    <button
                      onClick={() => { setTransType('expense'); setIsAddModalOpen(true); }}
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-medium transition flex items-center justify-center space-x-2 shadow-sm"
                    >
                      <Plus size={18} />
                      <span>Thêm Khoản Chi Tiêu</span>
                    </button>
                    <button
                      onClick={() => { setTransType('income'); setIsAddModalOpen(true); }}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-medium transition flex items-center justify-center space-x-2 shadow-sm"
                    >
                      <Plus size={18} />
                      <span>Thêm Khoản Thu Nhập</span>
                    </button>
                    <button
                      onClick={handleExportJSON}
                      className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-medium transition flex items-center justify-center space-x-2"
                    >
                      <Download size={18} />
                      <span>Xuất File JSON</span>
                    </button>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100">
                  <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
                    <h4 className="text-indigo-900 font-bold text-xs uppercase tracking-wider mb-1">Phiên bản v2 sẵn sàng</h4>
                    <p className="text-xs text-indigo-700">Đã tích hợp sẵn sàng kết nối tài khoản ngân hàng tự động ở tab Ngân hàng (v2).</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 2: TRANSACTIONS --- */}
        {activeTab === 'transactions' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto flex-1">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Tìm kiếm giao dịch..."
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                >
                  <option value="all">Tất cả loại</option>
                  <option value="expense">Chi tiêu</option>
                  <option value="income">Thu nhập</option>
                </select>

                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                >
                  <option value="all">Tất cả danh mục</option>
                  {[...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <select
                  value={filterMember}
                  onChange={(e) => setFilterMember(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                >
                  <option value="all">Tất cả thành viên</option>
                  {userSettings.familyMembers.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center space-x-2 shadow transition"
                >
                  <Plus size={18} />
                  <span>Thêm Giao Dịch</span>
                </button>
                <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium flex items-center space-x-2 cursor-pointer transition">
                  <Upload size={18} />
                  <span>Nhập JSON</span>
                  <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
                </label>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider">
                      <th className="p-4">Ngày</th>
                      <th className="p-4">Mô tả</th>
                      <th className="p-4">Danh mục</th>
                      <th className="p-4">Thành viên</th>
                      <th className="p-4">Ví</th>
                      <th className="p-4 text-right">Số tiền</th>
                      <th className="p-4 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-slate-400">
                          Không tìm thấy giao dịch nào phù hợp.
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map(t => (
                        <tr key={t.id} className="hover:bg-slate-50/80 transition">
                          <td className="p-4 text-slate-500 whitespace-nowrap">{t.date}</td>
                          <td className="p-4 font-medium text-slate-800">{t.description}</td>
                          <td className="p-4">
                            <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-medium">
                              {t.category}
                            </span>
                          </td>
                          <td className="p-4 text-slate-600">{t.memberName}</td>
                          <td className="p-4 text-slate-500">{t.wallet}</td>
                          <td className={`p-4 text-right font-bold ${t.type === 'income' ? 'text-emerald-600' : 'text-slate-800'}`}>
                            {t.type === 'income' ? '+' : '-'}{formatVND(t.amount)}
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => handleDeleteTransaction(t.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                              title="Xóa"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 3: ANALYTICS --- */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie Chart: Expenses by Category */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-base font-bold text-slate-800 mb-4">Tỷ trọng chi tiêu theo danh mục</h3>
                {expenseByCategory.length === 0 ? (
                  <div className="text-center py-20 text-slate-400">Chưa có dữ liệu chi tiêu để vẽ biểu đồ.</div>
                ) : (
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseByCategory}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label
                        >
                          {expenseByCategory.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => formatVND(Number(value))} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Bar Chart: Income vs Expense by Member */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-base font-bold text-slate-800 mb-4">Chi tiêu theo thành viên gia đình</h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={userSettings.familyMembers.map(m => {
                      const total = transactions
                        .filter(t => t.type === 'expense' && t.memberName === m)
                        .reduce((sum, t) => sum + t.amount, 0);
                      return { member: m, chiTieu: total };
                    })}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="member" />
                      <YAxis />
                      <Tooltip formatter={(value: any) => formatVND(Number(value))} />
                      <Bar dataKey="chiTieu" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 4: RECURRING BILLS --- */}
        {activeTab === 'bills' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Nhắc nhở khoản phí cố định</h3>
                <p className="text-sm text-slate-500">Quản lý tiền nhà, điện nước, internet, bảo hiểm và Netflix hàng tháng.</p>
              </div>
              <button
                onClick={() => setIsBillModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center space-x-2 shadow transition"
              >
                <Plus size={18} />
                <span>Thêm Phí Cố Định</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recurringBills.length === 0 ? (
                <div className="col-span-full text-center py-16 bg-white rounded-2xl border border-slate-200 text-slate-400">
                  <Calendar size={48} className="mx-auto mb-3 opacity-50" />
                  <p>Chưa có khoản phí cố định nào được thiết lập.</p>
                </div>
              ) : (
                recurringBills.map(bill => (
                  <div key={bill.id} className={`bg-white p-6 rounded-2xl border shadow-sm transition flex flex-col justify-between ${
                    bill.status === 'paid' ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          bill.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {bill.status === 'paid' ? 'Đã thanh toán' : `Đến hạn ngày ${bill.dueDate}`}
                        </span>
                        <button onClick={() => handleDeleteBill(bill.id)} className="text-slate-400 hover:text-rose-600">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <h4 className="font-bold text-slate-800 text-base mb-1">{bill.title}</h4>
                      <p className="text-xs text-slate-500 mb-4">{bill.category} • Định kỳ {bill.frequency}</p>
                      <div className="text-xl font-extrabold text-slate-900 mb-4">
                        {formatVND(bill.amount)}
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleBillStatus(bill)}
                      className={`w-full py-2.5 rounded-xl font-medium text-sm transition flex items-center justify-center space-x-2 ${
                        bill.status === 'paid' 
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' 
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                      }`}
                    >
                      <CheckCircle size={16} />
                      <span>{bill.status === 'paid' ? 'Đánh dấu chưa đóng' : 'Xác nhận đã đóng'}</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* --- TAB 5: REPORTS --- */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between print:hidden">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Báo cáo tài chính tháng</h3>
                <p className="text-sm text-slate-500">Tổng hợp thu chi, số dư và tỷ lệ tiết kiệm của gia đình.</p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => window.print()}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center space-x-2 transition"
                >
                  <FileText size={18} />
                  <span>In Báo Cáo</span>
                </button>
                <button
                  onClick={handleExportJSON}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center space-x-2 shadow transition"
                >
                  <Download size={18} />
                  <span>Xuất Dữ Liệu</span>
                </button>
              </div>
            </div>

            {/* Printable Statement Card */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm max-w-4xl mx-auto space-y-6">
              <div className="text-center border-b pb-6">
                <h2 className="text-2xl font-black text-slate-900">BÁO CÁO TÀI CHÍNH GIA ĐÌNH</h2>
                <p className="text-sm text-slate-500 mt-1">Kỳ báo cáo: Tháng {new Date().getMonth() + 1} / {new Date().getFullYear()}</p>
                <p className="text-xs text-slate-400 mt-0.5">Đơn vị tính: VNĐ (Hiển thị quy đổi từ ngàn VNĐ)</p>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center py-4 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-xs text-slate-500 uppercase font-bold">Tổng thu</p>
                  <p className="text-lg font-extrabold text-emerald-600 mt-1">{formatVND(totalIncome)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-bold">Tổng chi</p>
                  <p className="text-lg font-extrabold text-rose-600 mt-1">{formatVND(totalExpense)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-bold">Chênh lệch (Tiết kiệm)</p>
                  <p className={`text-lg font-extrabold mt-1 ${netBalance >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                    {formatVND(netBalance)}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-3 text-sm">Chi tiết chi tiêu theo danh mục:</h4>
                <div className="space-y-2">
                  {expenseByCategory.map((item, index) => {
                    const percentage = totalExpense > 0 ? ((item.value / totalExpense) * 100).toFixed(1) : '0';
                    return (
                      <div key={item.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-sm">
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                          <span className="font-medium text-slate-700">{item.name}</span>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className="text-slate-500 text-xs">{percentage}%</span>
                          <span className="font-bold text-slate-900">{formatVND(item.value)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 6: BANK CONNECTION (VERSION 2) --- */}
        {activeTab === 'bank' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-8 rounded-2xl shadow-xl relative overflow-hidden">
              <div className="absolute right-4 bottom-4 opacity-15">
                <Shield size={180} />
              </div>
              <div className="relative z-10 max-w-2xl">
                <span className="bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  Tính năng nâng cấp • Version 2
                </span>
                <h2 className="text-2xl font-black mt-3 mb-2">Kết nối Tài khoản Ngân hàng Tự động</h2>
                <p className="text-indigo-200 text-sm leading-relaxed mb-6">
                  Đồng bộ lịch sử giao dịch trực tiếp từ các ngân hàng nội địa (Vietcombank, Techcombank, MB Bank, TPBank, BIDV, ACB) thông qua Open Banking API tiêu chuẩn bảo mật cao.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button 
                    onClick={() => showNotify('Tính năng kết nối ngân hàng v2 sẽ khả dụng trong bản cập nhật tới!', 'success')}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-3 rounded-xl shadow transition flex items-center space-x-2"
                  >
                    <Plus size={18} />
                    <span>Liên kết Ngân hàng mới</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { name: 'Vietcombank', logo: 'VCB', status: 'Sẵn sàng ở v2', color: 'bg-emerald-600' },
                { name: 'Techcombank', logo: 'TCB', status: 'Sẵn sàng ở v2', color: 'bg-rose-600' },
                { name: 'MB Bank', logo: 'MB', status: 'Sẵn sàng ở v2', color: 'bg-blue-600' },
                { name: 'TPBank', logo: 'TPB', status: 'Sẵn sàng ở v2', color: 'bg-purple-600' },
                { name: 'BIDV', logo: 'BIDV', status: 'Sẵn sàng ở v2', color: 'bg-cyan-600' },
                { name: 'ACB', logo: 'ACB', status: 'Sẵn sàng ở v2', color: 'bg-amber-600' },
              ].map(bank => (
                <div key={bank.name} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`w-12 h-12 rounded-xl ${bank.color} text-white font-bold flex items-center justify-center shadow`}>
                      {bank.logo}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">{bank.name}</h4>
                      <p className="text-xs text-indigo-600 font-medium">{bank.status}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => showNotify(`Chuẩn bị kết nối API ${bank.name} cho v2`, 'success')}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-medium transition"
                  >
                    Kết nối
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- TAB 7: SETTINGS & AI KEYS --- */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-lg font-bold text-slate-800 border-b pb-3">Cấu hình AI Phân loại Giao dịch</h3>
              
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-bold text-slate-700 text-sm">Bật tính năng AI</label>
                  <p className="text-xs text-slate-500">Tự động phân tích văn bản thành giao dịch thu chi</p>
                </div>
                <input
                  type="checkbox"
                  checked={userSettings.aiSettings.enabled}
                  onChange={(e) => setUserSettings({
                    ...userSettings,
                    aiSettings: { ...userSettings.aiSettings, enabled: e.target.checked }
                  })}
                  className="w-5 h-5 text-blue-600 rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Chọn nhà cung cấp AI</label>
                <select
                  value={userSettings.aiSettings.provider}
                  onChange={(e) => setUserSettings({
                    ...userSettings,
                    aiSettings: { ...userSettings.aiSettings, provider: e.target.value as any }
                  })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"
                >
                  <option value="gemini">Google Gemini AI (Mặc định)</option>
                  <option value="openai">OpenAI (ChatGPT)</option>
                  <option value="deepseek">DeepSeek AI</option>
                  <option value="grok">Grok (xAI)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">API Key (Tùy chọn cho OpenAI, DeepSeek, Grok)</label>
                <input
                  type="password"
                  value={userSettings.aiSettings.apiKey}
                  onChange={(e) => setUserSettings({
                    ...userSettings,
                    aiSettings: { ...userSettings.aiSettings, apiKey: e.target.value }
                  })}
                  placeholder="Nhập API Key của nhà cung cấp..."
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"
                />
                <p className="text-xs text-slate-400 mt-1">Nếu dùng Gemini có thể bỏ trống để sử dụng hệ thống AI mặc định.</p>
              </div>

              <div className="pt-4 border-t flex justify-end">
                <button
                  onClick={() => {
                    localStorage.setItem(storageKey('family_finance_settings'), JSON.stringify(userSettings));
                    showNotify('Đã lưu cài đặt thành công!', 'success');
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-xl shadow transition text-sm"
                >
                  Lưu Cài Đặt
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* --- ADD TRANSACTION MODAL --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-slate-800">
                {transType === 'expense' ? 'Thêm khoản chi tiêu' : 'Thêm khoản thu nhập'}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleSaveTransaction} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Số tiền (ngàn VNĐ)</label>
                <input
                  type="number"
                  required
                  value={transAmount}
                  onChange={(e) => setTransAmount(e.target.value)}
                  placeholder="VD: 50 (tương ứng 50.000 đ)"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Danh mục</label>
                <select
                  value={transCategory}
                  onChange={(e) => setTransCategory(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"
                >
                  {(transType === 'expense' ? DEFAULT_CATEGORIES.expense : DEFAULT_CATEGORIES.income).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Mô tả giao dịch</label>
                <input
                  type="text"
                  value={transDesc}
                  onChange={(e) => setTransDesc(e.target.value)}
                  placeholder="VD: Ăn trưa văn phòng..."
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Thành viên</label>
                  <select
                    value={transMember}
                    onChange={(e) => setTransMember(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                  >
                    {userSettings.familyMembers.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Ví / Nguồn</label>
                  <select
                    value={transWallet}
                    onChange={(e) => setTransWallet(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                  >
                    {userSettings.wallets.map(w => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Ngày giao dịch</label>
                <input
                  type="date"
                  value={transDate}
                  onChange={(e) => setTransDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="pt-3 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium shadow"
                >
                  Lưu Giao Dịch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD BILL MODAL --- */}
      {isBillModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-slate-800">Thêm Khoản Phí Cố Định</h3>
              <button onClick={() => setIsBillModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleSaveBill} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Tên khoản phí</label>
                <input
                  type="text"
                  required
                  value={billTitle}
                  onChange={(e) => setBillTitle(e.target.value)}
                  placeholder="VD: Tiền điện, Tiền internet..."
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Số tiền (ngàn VNĐ)</label>
                <input
                  type="number"
                  required
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                  placeholder="VD: 500 (500.000đ)"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Ngày đến hạn (1-31)</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={billDueDate}
                    onChange={(e) => setBillDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Định kỳ</label>
                  <select
                    value={billFrequency}
                    onChange={(e) => setBillFrequency(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                  >
                    <option value="monthly">Hàng tháng</option>
                    <option value="weekly">Hàng tuần</option>
                    <option value="yearly">Hàng năm</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsBillModalOpen(false)}
                  className="px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium shadow"
                >
                  Lưu Khoản Phí
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
