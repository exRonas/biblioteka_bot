import Fastify from 'fastify';
import { config } from '../core/config';
import { handleWhatsAppMessage, verifyWebhook } from './handlers';

const fastify = Fastify({ logger: true });

// Webhook verification
fastify.get('/webhook', async (request, reply) => {
  return verifyWebhook(request, reply);
});

// Incoming messages
fastify.post('/webhook', async (request, reply) => {
  const body: any = request.body;

  // Check if it's a message
  if (body.object) {
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0] &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const message = body.entry[0].changes[0].value.messages[0];
      const business_phone_number_id = body.entry[0].changes[0].value.metadata.phone_number_id;

      await handleWhatsAppMessage(message, business_phone_number_id);
    }
  }

  reply.code(200).send('EVENT_RECEIVED');
});

export const startWhatsAppServer = async () => {
  try {
    await fastify.listen({ port: config.port as number, host: '0.0.0.0' });
    console.log(`WhatsApp server listening on ${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
