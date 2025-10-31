// /workspaces/insightsgpt/web/pages/api/auth/google/disconnect.js
import { getIronSession } from 'iron-session';

const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: 'aa_auth',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const session = await getIronSession(req, res, sessionOptions);
  if (session?.gaTokens) {
    delete session.gaTokens;
  }
  // iron-session has destroy(); fall back to save() if not available
  if (typeof session.destroy === 'function') {
    await session.destroy();
  } else {
    await session.save();
  }
  res.status(200).json({ ok: true });
}
