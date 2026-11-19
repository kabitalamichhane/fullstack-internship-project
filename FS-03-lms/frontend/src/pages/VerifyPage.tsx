import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

type Verification = { valid: boolean; name: string; course: string; instructor: string; issuedAt: string; code: string };

/** Public page anyone can open to check a certificate is genuine. */
export default function VerifyPage() {
  const { code } = useParams();
  const [data, setData] = useState<Verification | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Verification>(`/certificates/verify/${code}`).then(setData).catch((e) => setError(e.message));
  }, [code]);

  return (
    <div className="mx-auto mt-16 max-w-lg px-4">
      {error && <div className="card border-red-200 bg-red-50 text-center text-red-700">❌ {error}</div>}
      {data && (
        <div className="card space-y-2 border-green-200 text-center">
          <p className="text-4xl">✅</p>
          <h1 className="text-xl font-bold">Valid certificate</h1>
          <p><b>{data.name}</b> completed <b>{data.course}</b></p>
          <p className="text-sm text-slate-500">Instructor: {data.instructor} · Issued {new Date(data.issuedAt).toLocaleDateString()}</p>
          <p className="font-mono text-sm">ID: {data.code}</p>
        </div>
      )}
      {!data && !error && <p className="text-center text-slate-500">Checking…</p>}
    </div>
  );
}
