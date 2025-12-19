import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, LogOut, X } from 'lucide-react';

const API_URL = '/api';

const AuthForm = ({ onAuth }) => {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = mode === 'signup' ? '/auth/signup' : '/auth/login';
    const payload = mode === 'signup' ? { email, password, name } : { email, password };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      
      if (data.success) {
        onAuth(data.user);
      } else {
        setError(data.error || 'فشل تسجيل الدخول');
      }
    } catch (err) {
      setError('مشكلة في الاتصال بالسيرفر. تأكد إن الـ Backend شغال على port 5000');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 bg-white rounded-xl shadow-2xl max-w-md mx-auto transform transition-all">
      <h3 className="text-2xl font-bold mb-6 text-center text-gray-800 font-sans">
        {mode === 'signup' ? '🚀 إنشاء حساب جديد' : '👋 أهلاً بيك تاني'}
      </h3>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded shadow-sm">
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'signup' && (
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="الاسم الكامل / Full Name"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
          />
        )}
        <input
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="البريد الإلكتروني / Email"
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
        />
        <input
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="كلمة المرور / Password"
          type="password"
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
        />
        
        <button 
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition duration-200 transform hover:scale-[1.02] shadow-md flex justify-center items-center"
        >
          {loading ? (
             <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          ) : (
            mode === 'signup' ? '📝 تسجيل' : '🔐 دخول'
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => { setError(''); setMode(mode === 'signup' ? 'login' : 'signup'); }}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline transition"
        >
          {mode === 'signup' ? 'عندك حساب؟ سجل دخول' : 'مش عندك حساب؟ سجل دلوقتي'}
        </button>
      </div>
    </div>
  );
};

const ChatInterface = ({ user, onLogout }) => {
  const [messages, setMessages] = useState([]);
  const [step, setStep] = useState('LOADING');
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    const loadRoutes = async () => {
      try {
        const res = await fetch(`${API_URL}/routes`);
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          setRoutes(data.routes);
          setStep('ROUTE');
          addMessage(
            `أهلاً ${user.name || 'يا صديقي'} 👋\n\nأنا هنا عشان أساعدك تعرف التأخير المتوقع في رحلتك 🚌\n\nأول حاجة، عايز تسلك أنهي طريق؟`,
            'bot',
            data.routes.slice(0, 6)
          );
        } else {
          setStep('ERROR');
          addMessage('⚠️ معلش، مش لاقي الطرق المتاحة. تأكد إن الـ Backend شغال والـ CSV موجود.', 'bot');
        }
      } catch (err) {
        setStep('ERROR');
        addMessage('❌ مشكلة في الاتصال بالسيرفر. تأكد إن الـ Backend شغال على port 5000', 'bot');
      }
    };
    loadRoutes();
  }, [user.name]);

  const addMessage = (text, type = 'bot', options = null) => {
    setMessages(prev => [...prev, { text, type, options }]);
  };

  const handleOptionClick = (option) => {
    handleUserResponse(option);
  };

  const normalizeInput = (input) => {
    const lower = input.toLowerCase().trim();
    
    if (lower.includes('مشمس') || lower.includes('sunny') || lower.includes('sun')) return 'sunny';
    if (lower.includes('غيوم') || lower.includes('سحاب') || lower.includes('cloudy') || lower.includes('cloud')) return 'cloudy';
    if (lower.includes('مطر') || lower.includes('rainy') || lower.includes('rain')) return 'rainy';
    if (lower.includes('ضباب') || lower.includes('شبورة') || lower.includes('foggy') || lower.includes('fog')) return 'foggy';
    
    return input;
  };

  const handleUserResponse = async (inputVal) => {
    if (!inputVal.trim()) return;

    const normalized = normalizeInput(inputVal);
    addMessage(inputVal, 'user');

    if (step === 'ROUTE') {
      const routeMatch = routes.find(r => 
        inputVal.toUpperCase().includes(r) || 
        r.includes(inputVal.toUpperCase()) ||
        inputVal.toUpperCase().replace(/\s/g, '') === r.replace(/\s/g, '')
      );
      
      if (routeMatch) {
        setFormData(prev => ({ ...prev, route_id: routeMatch }));
        setStep('WEATHER');
        setTimeout(() => {
          addMessage(
            `تمام! الطريق ${routeMatch} اختيار ممتاز 👍\n\nدلوقتي قولي، الجو إيه النهارده؟`,
            'bot',
            ['☀️ مشمس (Sunny)', '☁️ غيوم (Cloudy)', '🌧️ مطر (Rainy)', '🌫️ ضباب (Foggy)']
          );
        }, 500);
      } else {
        addMessage(
          `⚠️ معلش، الطريق "${inputVal}" مش موجود.\n\nاختار من الطرق المتاحة:`,
          'bot',
          routes.slice(0, 6)
        );
      }
    } 
    else if (step === 'WEATHER') {
      const weather = normalized;
      setFormData(prev => ({ ...prev, weather }));
      setStep('TIME');
      setTimeout(() => {
        const weatherText = weather === 'rainy' ? 'ممطر 🌧️' : 
                           weather === 'sunny' ? 'مشمس ☀️' : 
                           weather === 'cloudy' ? 'غيوم ☁️' : 
                           'ضبابي 🌫️';
        addMessage(
          `حاضر، الجو ${weatherText}\n\nآخر سؤال: الرحلة هتكون الساعة كام؟`,
          'bot',
          ['⏰ دلوقتي (Now)', '🌅 الصبح 8 صباحاً', '🌆 وقت الذروة 5 مساءً', '🕐 اكتب وقت تاني']
        );
      }, 500);
    }
    else if (step === 'TIME') {
      let time = inputVal;
      let timeText = inputVal;
      
      if (inputVal.includes('دلوقتي') || inputVal.toLowerCase().includes('now') || inputVal.includes('الآن')) {
        const now = new Date();
        time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        timeText = `الساعة ${time}`;
      } else if (inputVal.includes('الصبح') || inputVal.includes('صباح') || inputVal.includes('8')) {
        time = '08:00';
        timeText = 'الساعة 8 صباحاً';
      } else if (inputVal.includes('الذروة') || inputVal.includes('ذروة') || inputVal.includes('5') || inputVal.includes('مساء')) {
        time = '17:00';
        timeText = 'الساعة 5 مساءً';
      } else if (inputVal.includes('تاني') || inputVal.includes('آخر') || inputVal.includes('مختلف') || inputVal.includes('اكتب')) {
        addMessage(
          'تمام! اكتب الوقت اللي عايزه بالصيغة دي:\n\n' +
          '• 08:00 (صباحاً)\n' +
          '• 14:30 (ظهراً)\n' +
          '• 17:00 (عصراً)\n' +
          '• أو اكتب رقم الساعة فقط (مثل: 9 أو 14)',
          'bot'
        );
        return;
      } else {
        const timeMatch = inputVal.match(/(\d{1,2}):?(\d{2})?/);
        if (timeMatch) {
          const hour = parseInt(timeMatch[1]);
          const min = (timeMatch[2] || '00');
          
          if (hour >= 0 && hour <= 23) {
            time = `${hour.toString().padStart(2, '0')}:${min.padStart(2, '0')}`;
            timeText = `الساعة ${time}`;
          } else {
            addMessage('⚠️ معلش، الوقت غلط. اكتب وقت صح من 0 لـ 23 (مثال: 8:00 أو 14:30)', 'bot');
            return;
          }
        } else {
          addMessage('⚠️ مش فاهم الوقت. اكتب بالصيغة دي: 8:00 أو 14:30 أو اضغط على أحد الخيارات', 'bot',
            ['⏰ دلوقتي (Now)', '🌅 الصبح 8 صباحاً', '🌆 وقت الذروة 5 مساءً']
          );
          return;
        }
      }

      const finalData = { ...formData, scheduled_time: time };
      setFormData(finalData);
      setStep('PREDICTING');
      setLoading(true);
      
      addMessage(`⏳ تمام! هحلل الرحلة في ${timeText}...`, 'bot');
      await predictDelay(finalData);
    }
    else if (step === 'DONE') {
      setFormData({});
      setStep('ROUTE');
      addMessage(
        `تمام! خلينا نبدأ من الأول 🔄\n\nعايز تسلك أنهي طريق؟`,
        'bot',
        routes.slice(0, 6)
      );
    }
  };

  const predictDelay = async (data) => {
    try {
      const payload = {
        route_id: data.route_id,
        scheduled_time: data.scheduled_time,
        weather: data.weather,
        day_type: new Date().getDay() % 6 === 0 ? 'weekend' : 'weekday'
      };

      const res = await fetch(`${API_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      setLoading(false);
      if (result.delay !== undefined) {
        let statusEmoji = '✅';
        let statusText = 'في الوقت';
        if (result.delay > 10) {
          statusEmoji = '🔴';
          statusText = 'تأخير كبير';
        } else if (result.delay > 5) {
          statusEmoji = '🟡';
          statusText = 'تأخير متوسط';
        } else if (result.delay > 0) {
          statusEmoji = '🟢';
          statusText = 'تأخير بسيط';
        }

        const responseText = `${statusEmoji} التنبؤ جاهز للطريق ${data.route_id}!\n\n` +
          `📊 الحالة: ${statusText}\n` +
          `⏱️ التأخير المتوقع: ${result.delay} دقيقة\n` +
          `🎯 دقة التنبؤ: ${result.confidence}%\n\n` +
          `💡 الأسباب:\n${result.reasons ? result.reasons.map(r => `  • ${r.factor}: ${r.impact}`).join('\n') : ''}\n\n` +
          `عايز تفحص طريق تاني؟`;
        
        addMessage(responseText, 'bot', ['🔄 طريق جديد']);
        setStep('DONE');
      } else {
        addMessage('❌ عذراً، حصل خطأ في الحسابات. جرب مرة تانية؟', 'bot', routes.slice(0, 4));
        setStep('ROUTE');
      }

    } catch (err) {
      setLoading(false);
      addMessage('⚠️ مشكلة في الاتصال بالسيرفر. تأكد إنه شغال على port 5000!', 'bot');
      setStep('ROUTE');
    }
  };

  return (
    <div className="flex flex-col h-[600px] w-full max-w-4xl bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 flex justify-between items-center text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
            <Bot size={24} />
          </div>
          <div>
            <h3 className="font-bold text-lg">🚌 مساعد النقل الذكي</h3>
            <span className="text-xs text-blue-100 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span> متصل
            </span>
          </div>
        </div>
        <button 
          onClick={onLogout}
          className="p-2 hover:bg-white/10 rounded-full transition-colors flex items-center gap-2 text-sm"
        >
          <span className="hidden sm:inline">خروج</span>
          <LogOut size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gradient-to-b from-gray-50 to-white">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.type === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`
              max-w-[80%] rounded-2xl p-4 shadow-sm relative text-sm md:text-base whitespace-pre-line leading-relaxed
              ${msg.type === 'user' 
                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-br-none' 
                : 'bg-white text-gray-800 rounded-bl-none border border-gray-200'}
            `}>
              {msg.text}
            </div>
            
            {msg.options && (
              <div className="mt-3 flex flex-wrap gap-2 max-w-[85%]">
                {msg.options.map(opt => (
                  <button 
                    key={opt}
                    onClick={() => handleOptionClick(opt)}
                    className="bg-white border-2 border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-400 px-4 py-2 rounded-full text-sm font-medium transition-all shadow-sm hover:shadow-md transform hover:scale-105"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white p-4 rounded-2xl rounded-bl-none border border-gray-200 shadow-sm flex items-center gap-2">
              <span className="text-gray-500 text-xs font-medium">جاري التفكير</span>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-gray-100 flex gap-3 items-center relative z-10">
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={loading}
          placeholder="اكتب إجابتك هنا... (عربي أو English)"
          className="flex-1 p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none shadow-inner"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && inputValue.trim()) {
              handleUserResponse(inputValue);
              setInputValue('');
            }
          }}
        />
        <button 
          onClick={() => {
            if (inputValue.trim()) {
              handleUserResponse(inputValue);
              setInputValue('');
            }
          }}
          disabled={loading || !inputValue.trim()}
          className="bg-blue-600 text-white p-4 rounded-xl hover:bg-blue-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  );
};

const ModelApp = ({ onClose }) => {
  const [user, setUser] = useState(null);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl relative">
        <button 
          onClick={onClose} 
          className="absolute -top-12 right-0 text-white/80 hover:text-white transition-colors flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full backdrop-blur-md hover:bg-white/20"
        >
          <X size={18} /> إغلاق
        </button>
        
        {!user ? (
          <AuthForm onAuth={setUser} />
        ) : (
          <ChatInterface user={user} onLogout={() => setUser(null)} />
        )}
      </div>
    </div>
  );
};

export default ModelApp;