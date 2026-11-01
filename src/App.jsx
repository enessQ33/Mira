import { useEffect, useMemo, useRef, useState } from 'react';

const defaultGreeting = 'Buradayım. Anlat bakalım.';

function App() {
  const [view, setView] = useState('home');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [memories, setMemories] = useState([]);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [error, setError] = useState('');
  const [appStatus, setAppStatus] = useState('online');
  const recognitionRef = useRef(null);

  const orbPhase = useMemo(() => {
    if (isListening) return 'listening';
    if (isSpeaking) return 'speaking';
    if (isLoading) return 'thinking';
    return 'idle';
  }, [isListening, isSpeaking, isLoading]);

  useEffect(() => {
    const onlineHandler = () => setAppStatus(navigator.onLine ? 'online' : 'offline');
    onlineHandler();
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', onlineHandler);
    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', onlineHandler);
    };
  }, []);

  useEffect(() => {
    loadConversations();
    loadMemories();
  }, []);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
    }
  }, [activeConversationId]);

  const loadConversations = async () => {
    try {
      const response = await fetch('/api/conversations');
      if (!response.ok) throw new Error('Konuşmalar yüklenemedi');
      const data = await response.json();
      setConversations(data.conversations || []);
      if (data.conversations?.length) {
        const newest = data.conversations[0];
        setActiveConversationId(newest.id);
        await loadConversationMessages(newest.id);
      }
    } catch (err) {
      setError(err.message || 'Konuşma listesi yüklenemedi.');
    }
  };

  const loadMemories = async () => {
    try {
      const response = await fetch('/api/memories');
      if (!response.ok) throw new Error('Hafıza yüklenemedi');
      const data = await response.json();
      setMemories(data.memories || []);
    } catch (err) {
      setError(err.message || 'Hafıza yüklenemedi.');
    }
  };

  const loadConversationMessages = async (conversationId) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      if (!response.ok) throw new Error('Konuşma yüklenemedi');
      const data = await response.json();
      setMessages(data.messages || []);
      setView('chat');
    } catch (err) {
      setError(err.message || 'Konuşma detayları yüklenemedi.');
    }
  };

  const createConversation = async (title) => {
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) throw new Error('Yeni konuşma oluşturulamadı');
      const data = await response.json();
      setActiveConversationId(data.conversation.id);
      setMessages([]);
      setConversations((prev) => [data.conversation, ...prev]);
      setView('chat');
      return data.conversation.id;
    } catch (err) {
      setError(err.message || 'Yeni konuşma oluşturulamadı.');
      return null;
    }
  };

  const streamAssistantReply = async (conversationId, history, userText) => {
    const payload = {
      conversationId,
      messages: history,
      userMessage: userText,
    };

    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: 'Sunucu hatası' }));
      throw new Error(errorBody.error || 'MIRA yanıt veremedi.');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let assistantBuffer = '';

    if (!reader) {
      throw new Error('Yanıt akışı başlatılamadı.');
    }

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n\n');

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const parsed = line.replace(/^data:\s*/, '').trim();
        if (!parsed) continue;
        const event = JSON.parse(parsed);

        if (event.type === 'chunk') {
          assistantBuffer += event.content;
          setMessages((prev) => {
            const next = [...prev];
            const lastIndex = next.length - 1;
            if (next[lastIndex]?.role === 'assistant') {
              next[lastIndex] = { ...next[lastIndex], content: assistantBuffer };
            }
            return next;
          });
        }

        if (event.type === 'done') {
          setMessages((prev) => {
            const next = [...prev];
            const lastIndex = next.length - 1;
            if (next[lastIndex]?.role === 'assistant') {
              next[lastIndex] = { ...next[lastIndex], content: event.content || assistantBuffer };
            }
            return next;
          });
        }

        if (event.type === 'error') {
          setError(event.content || 'MIRA bir hata verdi.');
          throw new Error(event.content || 'MIRA bir hata verdi.');
        }
      }
    }
  };

  const handleSend = async (inputText = draft) => {
    const trimmed = (inputText || '').trim();
    if (!trimmed || isLoading || appStatus === 'offline') return;

    const conversationId = activeConversationId || (await createConversation(trimmed.slice(0, 40)));
    if (!conversationId) return;

    const nextHistory = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextHistory);
    setDraft('');
    setIsLoading(true);
    setError('');

    try {
      await streamAssistantReply(conversationId, nextHistory, trimmed);
      await loadConversations();
    } catch (err) {
      setError(err.message || 'Mesaj gönderilemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  const speakText = (text) => {
    if (!('speechSynthesis' in window)) {
      setError('Bu tarayıcı ses çıktısı desteklemiyor.');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const preferredVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => /tr/i.test(voice.lang) || /turkish/i.test(voice.name)) || null;

    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.lang = 'tr-TR';
    utterance.rate = 1.02;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeech = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  const startListening = () => {
    if (appStatus === 'offline') {
      setError('Çevrimdışısın. Mikrofon kullanılamıyor.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Bu tarayıcı ses tanıma özelliğini desteklemiyor.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'tr-TR';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      setIsListening(true);
      setError('');
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }
      setDraft(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setError('Mikrofon konuşmayı anlayamadı. Lütfen tekrar dene.');
    };

    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const saveMemory = async () => {
    const trimmed = memoryDraft.trim();
    if (!trimmed) return;

    try {
      const response = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed, category: 'user-preference' }),
      });

      if (!response.ok) {
        throw new Error('Hafıza kaydedilemedi');
      }

      const data = await response.json();
      setMemories((prev) => [data.memory, ...prev]);
      setMemoryDraft('');
    } catch (err) {
      setError(err.message || 'Hafıza kaydedilemedi.');
    }
  };

  const deleteMemory = async (id) => {
    try {
      const response = await fetch(`/api/memories/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Hafıza silinemedi');
      setMemories((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err.message || 'Hafıza silinemedi.');
    }
  };

  const onInputKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="app-shell">
      <div className={`backdrop-grid ${orbPhase}`} />

      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">M</div>
          <span>MIRA</span>
        </div>

        <div className="status-wrap">
          <div className={`connection-pill ${appStatus}`}>
            {appStatus === 'offline' ? 'Çevrimdışı' : 'Bağlı'}
          </div>
          <button className="icon-button" type="button" onClick={() => setShowSettings(true)} aria-label="Ayarlar">
            ⚙
          </button>
        </div>
      </header>

      {error ? <div className="banner error">{error}</div> : null}

      {view === 'home' ? (
        <main className="home-screen">
          <div className="orb-wrap">
            <div className={`mira-orb ${orbPhase}`}>
              <div className="orb-core" />
              <div className="orb-ring ring-one" />
              <div className="orb-ring ring-two" />
            </div>
          </div>

          <div className="hero-copy">
            <p className="eyebrow">Private intelligence</p>
            <h1>MIRA</h1>
            <p className="greeting">{defaultGreeting}</p>
          </div>

          <div className="cta-row">
            <button className="primary-action mic" type="button" onClick={startListening} aria-label="Mikrofonla konuş">
              {isListening ? 'Dinliyorum…' : 'Mikrofon'}
            </button>
            <button className="primary-action chat" type="button" onClick={() => setView('chat')} aria-label="Yazılı sohbet">
              Mesaj
            </button>
          </div>
        </main>
      ) : (
        <main className="chat-screen">
          <div className="chat-header">
            <button className="ghost-button" type="button" onClick={() => setView('home')}>
              ←
            </button>
            <div>
              <p className="mini-label">MIRA</p>
              <h2>Konuşma</h2>
            </div>
            <button className="ghost-button" type="button" onClick={async () => {
              const freshId = await createConversation('Yeni konuşma');
              if (freshId) {
                setMessages([]);
              }
            }}>
              Yeni
            </button>
          </div>

          <div className="messages-panel">
            {messages.length === 0 ? (
              <div className="empty-state">
                <strong>Merhaba.</strong>
                <span>Bir şeyler anlatmaya başla; ben dinleyip sana düşünerek cevap vereceğim.</span>
              </div>
            ) : (
              messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`message-row ${message.role}`}>
                  <div className="message-bubble">
                    {message.content || (message.role === 'assistant' ? 'Düşünüyorum…' : '')}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="composer-shell">
            <div className="composer-actions">
              <button className="mini-action" type="button" onClick={startListening}>
                {isListening ? 'Dinleniyor' : '🎙'}
              </button>
              <button className="mini-action" type="button" onClick={stopSpeech}>
                {isSpeaking ? 'Durdur' : '🔇'}
              </button>
            </div>

            <textarea
              value={draft}
              rows={1}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="İstersen yaz, istersen konuş…"
            />

            <button className="send-button" type="button" onClick={() => handleSend()} disabled={isLoading || appStatus === 'offline'}>
              {isLoading ? 'Gönderiliyor…' : 'Gönder'}
            </button>
          </div>
        </main>
      )}

      {showSettings ? (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <aside className="settings-panel" onClick={(event) => event.stopPropagation()}>
            <div className="settings-header">
              <h3>Hafıza</h3>
              <button className="ghost-button" type="button" onClick={() => setShowSettings(false)}>Kapat</button>
            </div>

            <div className="memory-form">
              <textarea
                value={memoryDraft}
                onChange={(event) => setMemoryDraft(event.target.value)}
                placeholder="MIRA'nın hatırlamasını istediğin önemli detay…"
                rows={3}
              />
              <button className="primary-action small" type="button" onClick={saveMemory}>Kaydet</button>
            </div>

            <div className="memory-list">
              {memories.length === 0 ? (
                <p className="empty-memory">Henüz kaydedilmiş hafıza yok.</p>
              ) : (
                memories.map((memory) => (
                  <div key={memory.id} className="memory-item">
                    <div className="memory-copy">
                      <b>{memory.category}</b>
                      <p>{memory.content}</p>
                    </div>
                    <button className="delete-memory" type="button" onClick={() => deleteMemory(memory.id)}>
                      Sil
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export default App;
