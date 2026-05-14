const SUPPORT_EMAIL = 'support@ngtaskhub.com';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const validateSupportRequest = (body = {}) => {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!name || !emailRegex.test(email) || !message) {
    return {
      ok: false,
      statusCode: 400,
      message: 'Name, valid email, and message are required',
    };
  }

  return {
    ok: true,
    value: { name, email, message },
  };
};

export const buildSupportEmail = ({ name, email, message }) => ({
  to: SUPPORT_EMAIL,
  subject: `New support request from ${name}`,
  html: `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px;">
      <h2 style="margin:0 0 16px;color:#111827;">New Support Request</h2>
      <p style="margin:0 0 8px;"><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p style="margin:0 0 16px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
      <div style="padding:16px;background:#f9fafb;border-radius:6px;color:#111827;line-height:1.6;white-space:pre-wrap;">${escapeHtml(message)}</div>
    </div>
  `,
});
