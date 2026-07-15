/* ============================================================
   utils/sms.js — SMS Alert Utility
   Supports MSG91 in production, logs to console in dev.
   ============================================================ */

const https = require('https');

/**
 * Send an SMS to a phone number.
 * @param {string} phone   - 10-digit Indian mobile number (without +91)
 * @param {string} message - SMS text (max 160 chars recommended)
 * @returns {Promise<{ success: boolean, messageId?: string }>}
 */
const sendSMS = async (phone, message) => {
  // Development / no SMS config → just log
  if (process.env.NODE_ENV !== 'production' || !process.env.SMS91_AUTH_KEY) {
    console.log(`[SMS stub] To: ${phone} | Message: ${message}`);
    return { success: true, messageId: `dev-${Date.now()}` };
  }

  return sendViaMSG91(phone, message);
};

// ── MSG91 Implementation ──────────────────────────────────────
const sendViaMSG91 = (phone, message) => {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      sender   : process.env.SMS91_SENDER_ID || 'CHIKIT',
      route    : '4',
      country  : '91',
      sms      : [{
        message,
        to: [`91${phone}`],
      }],
    });

    const options = {
      hostname: 'api.msg91.com',
      path    : '/api/sendhttp.php',
      method  : 'POST',
      headers : {
        'Content-Type'  : 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'authkey'       : process.env.SMS91_AUTH_KEY,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ success: parsed.type === 'success', messageId: parsed.message });
        } catch {
          resolve({ success: true, raw: data });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[SMS] MSG91 error:', err.message);
      resolve({ success: false, error: err.message });
    });

    req.write(payload);
    req.end();
  });
};

// ── SMS Templates ─────────────────────────────────────────────
const smsTemplates = {
  tokenCalling: (token, room) =>
    `Chikitsaalye: Your OPD token ${token} is being called now. Please report to ${room}.`,

  tokenSoon: (token, ahead) =>
    `Chikitsaalye: You are ${ahead} token(s) away. Token ${token} — please make your way to the OPD.`,

  reportReady: (reportName) =>
    `Chikitsaalye: Your lab report "${reportName}" is ready. Collect from Lab Counter 3 or view on the portal.`,

  appointmentReminder: (doctorName, date, time) =>
    `Chikitsaalye: Reminder — appointment with ${doctorName} on ${date} at ${time}. Please arrive 15 min early.`,

  appointmentCancelled: (doctorName, date) =>
    `Chikitsaalye: OPD session with ${doctorName} on ${date} has been rescheduled. Please contact the hospital.`,

  taskReminder: (taskTitle) =>
    `Chikitsaalye: Pending task reminder — "${taskTitle}". Please complete as advised by your doctor.`,
};

module.exports = { sendSMS, smsTemplates };
