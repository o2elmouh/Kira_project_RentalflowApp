import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER; // Must include 'whatsapp:' prefix

let client = null;
if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
} else {
  console.warn('⚠️ Twilio credentials missing. WhatsApp features will be disabled.');
}

/**
 * Format phone number for Twilio WhatsApp API.
 * Accepts: 06XXXXXXXX, 07XXXXXXXX, +212XXXXXXXXX, 00212XXXXXXXXX
 */
export const formatWhatsAppNumber = (phone) => {
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('06') || cleaned.startsWith('07')) {
    cleaned = '+212' + cleaned.substring(1);
  } else if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  } else if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  return `whatsapp:${cleaned}`;
};

/**
 * Send a free-form WhatsApp message via Twilio.
 * Only works within the 24h session window or Twilio Sandbox opt-in.
 */
export const sendWhatsAppMessage = async (to, body) => {
  if (!client) throw new Error('Twilio client is not initialized.');

  const formattedTo = formatWhatsAppNumber(to);
  const message = await client.messages.create({ body, from: fromNumber, to: formattedTo });
  console.log(`✅ WhatsApp sent! SID: ${message.sid}`);
  return { success: true, messageSid: message.sid, status: message.status };
};
