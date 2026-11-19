import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import { api, API_URL } from '../lib/api';
import { dateTime } from '../lib/format';
import type { LiveClass } from '../types';

type Message = { id: string; text: string; createdAt: string; user: { name: string; role: string } };
type LiveInfo = { liveClass: LiveClass & { course: { id: string; title: string } }; messages: Message[]; isHost: boolean };

/**
 * Live class: video/audio/screen share through LiveKit (WebRTC),
 * chat through Socket.io (saved in the database so late joiners see history).
 */
export default function LiveClassPage() {
  const { id } = useParams();
  const [info, setInfo] = useState<LiveInfo | null>(null);
  const [status, setStatus] = useState<LiveClass['status']>('SCHEDULED');
  const [conn, setConn] = useState<{ token: string; url: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [viewers, setViewers] = useState(0);
  const [error, setError] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<LiveInfo>(`/live/${id}`)
      .then((r) => {
        setInfo(r);
        setStatus(r.liveClass.status);
        setMessages(r.messages);
      })
      .catch((e) => setError(e.message));

    const socket = io(API_URL, { auth: { token: localStorage.getItem('token') } });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('live:join', id));
    socket.on('chat:message', (m: Message) => setMessages((prev) => [...prev, m]));
    socket.on('live:status', ({ status }: { status: LiveClass['status'] }) => setStatus(status));
    socket.on('presence:count', (n: number) => setViewers(n));
    socket.on('connect_error', () => setError('Chat connection failed. Please refresh.'));
    return () => {
      socket.disconnect();
    };
  }, [id]);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  // Leave the video room when the instructor ends the class.
  useEffect(() => {
    if (status === 'ENDED') setConn(null);
  }, [status]);

  const join = async () => {
    setError('');
    try {
      const r = await api<{ token: string; url: string }>(`/live/${id}/token`, { method: 'POST' });
      setConn(r);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const setLive = async (next: 'LIVE' | 'ENDED') => {
    try {
      await api(`/live/${id}/status`, { method: 'PATCH', json: { status: next } });
      setStatus(next);
      if (next === 'LIVE') join();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    socketRef.current?.emit('chat:send', { liveClassId: id, text });
    setText('');
  };

  if (!info) return <p className="p-8 text-center text-slate-500">{error || 'Loading…'}</p>;
  const lc = info.liveClass;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Link to={`/courses/${lc.course.id}`} className="text-sm text-brand-600">← {lc.course.title}</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{lc.title}</h1>
          <p className="text-sm text-slate-500">{dateTime(lc.scheduledAt)} · {viewers} in the room</p>
        </div>
        <div className="flex items-center gap-2">
          {status === 'LIVE' && <span className="badge animate-pulse bg-red-600 text-white">LIVE</span>}
          {info.isHost && status !== 'LIVE' && status !== 'ENDED' && <button className="btn-primary" onClick={() => setLive('LIVE')}>Go live</button>}
          {info.isHost && status === 'LIVE' && <button className="btn-danger" onClick={() => setLive('ENDED')}>End class</button>}
        </div>
      </div>
      {error && <p className="mt-2 text-red-600" role="alert">{error}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="overflow-hidden rounded-xl bg-slate-900" style={{ minHeight: 480 }}>
          {conn ? (
            <LiveKitRoom
              serverUrl={conn.url}
              token={conn.token}
              connect
              video={info.isHost}
              audio={info.isHost}
              onDisconnected={() => setConn(null)}
              data-lk-theme="default"
              style={{ height: 520 }}
            >
              <VideoConference />
            </LiveKitRoom>
          ) : (
            <div className="flex h-[480px] flex-col items-center justify-center gap-3 text-slate-200">
              {status === 'ENDED' && <p>This class has ended.</p>}
              {status === 'SCHEDULED' && !info.isHost && <p>The class hasn't started yet. This page updates automatically when it does.</p>}
              {status === 'LIVE' && <button className="btn-primary" onClick={join}>Join the class</button>}
              {status === 'SCHEDULED' && info.isHost && <p>Click “Go live” to start streaming your camera.</p>}
            </div>
          )}
        </div>

        <section className="card flex h-[520px] flex-col p-0" aria-label="Class chat">
          <h2 className="border-b p-3 font-semibold">Chat</h2>
          <ul className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            {messages.map((m) => (
              <li key={m.id}>
                <span className={`font-semibold ${m.user.role === 'INSTRUCTOR' ? 'text-brand-600' : ''}`}>
                  {m.user.name}{m.user.role === 'INSTRUCTOR' && ' (instructor)'}
                </span>{' '}
                <span className="text-xs text-slate-400">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <p className="break-words">{m.text}</p>
              </li>
            ))}
            {messages.length === 0 && <li className="text-slate-400">No messages yet. Say hi 👋</li>}
            <div ref={bottomRef} />
          </ul>
          <form onSubmit={send} className="flex gap-2 border-t p-3">
            <input className="input" placeholder="Ask a question…" aria-label="Chat message" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} disabled={status === 'ENDED'} />
            <button className="btn-primary" disabled={status === 'ENDED'}>Send</button>
          </form>
        </section>
      </div>
    </div>
  );
}
