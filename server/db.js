server/db.js
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

const dbDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, 'mira.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

export function getConversations() {
  return db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all();
}

export function getConversationById(id) {
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

export function createConversation(title = 'Yeni konuşma') {
  const now = Date.now();
  const conversation = {
    id: randomUUID(),
    title: title.trim().slice(0, 80) || 'Yeni konuşma',
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
  ).run(conversation.id, conversation.title, conversation.created_at, conversation.updated_at);

  return conversation;
}

export function updateConversationTitle(id, title) {
  const sanitized = title.trim().slice(0, 80) || 'Yeni konuşma';
  const now = Date.now();
  db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(sanitized, now, id);
  return getConversationById(id);
}

export function appendMessage(conversationId, role, content) {
  const now = Date.now();
  const message = {
    id: randomUUID(),
    conversation_id: conversationId,
    role,
    content,
    created_at: now,
  };

  db.prepare(
    'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(message.id, message.conversation_id, message.role, message.content, message.created_at);

  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);

  return message;
}

export function getMessagesByConversation(conversationId) {
  return db
    .prepare(
      'SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    )
    .all(conversationId);
}

export function getMemories() {
  return db.prepare('SELECT * FROM memories ORDER BY updated_at DESC').all();
}

export function createMemory({ category = 'user-preference', content }) {
  const now = Date.now();
  const memory = {
    id: randomUUID(),
    category,
    content: content.trim(),
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    'INSERT INTO memories (id, category, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(memory.id, memory.category, memory.content, memory.created_at, memory.updated_at);

  return memory;
}

export function updateMemory(id, { category, content }) {
  const now = Date.now();
  const memory = db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
  if (!memory) return null;

  const nextCategory = category || memory.category;
  const nextContent = content.trim() || memory.content;

  db.prepare('UPDATE memories SET category = ?, content = ?, updated_at = ? WHERE id = ?').run(
    nextCategory,
    nextContent,
    now,
    id,
  );

  return db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
}

export function deleteMemory(id) {
  const result = db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getRelevantMemoryContext(limit = 5) {
  return db.prepare('SELECT content FROM memories ORDER BY updated_at DESC LIMIT ?').all(limit);
}

export const dbInstance = db;
