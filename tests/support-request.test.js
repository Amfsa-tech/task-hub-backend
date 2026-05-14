import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSupportEmail,
  validateSupportRequest,
} from '../utils/supportRequestUtils.js';

describe('support requests', () => {
  it('normalizes valid support request input', () => {
    const result = validateSupportRequest({
      name: '  Ada Lovelace  ',
      email: '  ADA@Example.COM ',
      message: '  I need help with a task payment.  ',
    });

    assert.deepEqual(result, {
      ok: true,
      value: {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        message: 'I need help with a task payment.',
      },
    });
  });

  it('rejects missing or invalid support request fields', () => {
    assert.deepEqual(validateSupportRequest({ email: 'bad', message: 'hello' }), {
      ok: false,
      statusCode: 400,
      message: 'Name, valid email, and message are required',
    });
  });

  it('builds support email addressed to TaskHub support', () => {
    const email = buildSupportEmail({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      message: 'I need help with a task payment.',
    });

    assert.equal(email.to, 'support@ngtaskhub.com');
    assert.equal(email.subject, 'New support request from Ada Lovelace');
    assert.match(email.html, /ada@example\.com/);
    assert.match(email.html, /I need help with a task payment\./);
  });
});
