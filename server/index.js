import express from 'express';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import {
  appendMessage,
  createConversation,
  createMemory,
  deleteMemory,
  getConversationById,
  getConversations,
  getMessagesByConversation,
  getMemories,
  updateMemory,
  updateConversationTitle,
} from './db.js';
import { buildAssistantReply, getSystemPrompt } from './ai.js';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3001);

app.disable('x-powered-by');
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'MIRA API',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/conversations', (_request, response) => {
  const conversations = getConversations();
  response.json({ conversations });
});

app.post('/api/conversations', (request, response) => {
  const { title } = request.body || {};
  const conversation = createConversation(title || 'Yeni konuşma');
  response.status(201).json({ conversation });
});

app.get('/api/conversations/:conversationId/messages', (request, response) => {
  const { conversationId } = request.params;
  const conversation = getConversationById(conversationId);

  if (!conversation) {
    return response.status(404).json({ error: 'Konuşma bulunamadı.' });
  }

  const messages = getMessagesByConversation(conversationId);
  return response.json({ conversation, messages });
});

app.post('/api/conversations/:conversationId/messages', (request, response) => {
  const { conversationId } = request.params;
  const { role = 'user', content } = request.body || {};
  const conversation = getConversationById(conversationId);

  if (!conversation) {
    return response.status(404).json({ error: 'Konuşma bulunamadı.' });
  }

  if (!content || !String(content).trim()) {
    return response.status(400).json({ error: 'İçerik boş olamaz.' });
  }

  const message = appendMessage(conversationId, role, String(content).trim());
  return response.status(201).json({ message });
});

app.get('/api/memories', (_request, response) => {
  response.json({ memories: getMemories() });
});

app.post('/api/memories', (request, response) => {
  const { category = 'user-preference', content } = request.body || {};
  if (!content || !String(content).trim()) {
    return response.status(400).json({ error: 'Hafıza içeriği boş olamaz.' });
  }

  const memory = createMemory({ category, content: String(content).trim() });
  return response.status(201).json({ memory });
});

app.put('/api/memories/:memoryId', (request, response) => {
  const { memoryId } = request.params;
  const { category, content } = request.body || {};

  const memory = updateMemory(memoryId, { category, content });
  if (!memory) {
    return response.status(404).json({ error: 'Hafıza bulunamadı.' });
  }

  return response.json({ memory });
});

app.delete('/api/memories/:memoryId', (request, response) => {
  const { memoryId } = request.params;
  const deleted = deleteMemory(memoryId);

  if (!deleted) {
    return response.status(404).json({ error: 'Hafıza bulunamadı.' });
  }

  return response.json({ success: true });
});

app.post('/api/chat/stream', async (request, response) => {
  try {
    const { conversationId, messages = [], userMessage = '' } = request.body || {};

    if (!conversationId) {
      return response.status(400).json({ error: 'Konuşma kimliği gerekli.' });
    }

    const conversation = getConversationById(conversationId);
    if (!conversation) {
      return response.status(404).json({ error: 'Konuşma bulunamadı.' });
    }

    const trimmedUserMessage = String(userMessage || '').trim();
    if (!trimmedUserMessage) {
      return response.status(400).json({ error: 'Mesaj içeriği boş olamaz.' });
    }

    const userMessageRecord = appendMessage(conversationId, 'user', trimmedUserMessage);
    const trimmedHistory = Array.isArray(messages) ? messages.slice(-12) : [];
    const systemPrompt = getSystemPrompt();
    const finalMessages = [
      { role: 'system', content: systemPrompt },
      ...trimmedHistory.map((message) => ({
        role: message.role,
        content: String(message.content || ''),
      })),
    ];

    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');

    let reply = '';
    try {
      const answer = await buildAssistantReply(finalMessages);
      reply = answer;
      const parts = answer.match(/.{1,160}/gs) || [answer];

      for (const part of parts) {
        response.write(`data: ${JSON.stringify({ type: 'chunk', content: part })}\n\n`);
      }

      response.write(`data: ${JSON.stringify({ type: 'done', content: answer })}\n\n`);
      appendMessage(conversationId, 'assistant', answer);
      updateConversationTitle(conversationId, conversation.title || 'Yeni konuşma');
      if (conversation.title === 'Yeni konuşma' && trimmedUserMessage) {
        updateConversationTitle(conversationId, trimmedUserMessage.slice(0, 40));
      }
      return response.end();
    } catch (error) {
      appendMessage(conversationId, 'assistant', `MIRA şu anda cevap veremiyor: ${error.message}`);
      response.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
      return response.end();
    }
  } catch (error) {
    return response.status(500).json({ error: error.message || 'İç sunucu hatası.' });
  }
});

const distDir = path.join(rootDir, 'dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distDir));
  app.get('*', (_request, response) => {
    response.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`MIRA API listening on http://localhost:${PORT}`);
});
