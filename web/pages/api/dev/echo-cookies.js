export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const headers = { ...req.headers };
  if (headers.authorization) headers.authorization = '[redacted]';
  res.status(200).json({
    cookies: req.headers?.cookie || null,
    headers
  });
}
