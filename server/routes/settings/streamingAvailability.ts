import { getSettings } from '@server/lib/settings';
import { Router } from 'express';
import { z } from 'zod';

const streamingAvailabilitySettingsRoutes = Router();

const apiKeySchema = z.object({
  apiKey: z.string().trim().max(256),
});

streamingAvailabilitySettingsRoutes.get('/', (_req, res) => {
  const settings = getSettings();

  return res.status(200).json({
    hasApiKey: Boolean(settings.streamingAvailability.apiKey),
  });
});

streamingAvailabilitySettingsRoutes.post('/', async (req, res, next) => {
  const result = apiKeySchema.safeParse(req.body);
  if (!result.success) {
    return next({
      status: 400,
      message: 'Invalid Streaming Availability API key.',
    });
  }

  const settings = getSettings();
  settings.streamingAvailability.apiKey = result.data.apiKey;
  await settings.save();

  return res.status(200).json({
    hasApiKey: Boolean(settings.streamingAvailability.apiKey),
  });
});

streamingAvailabilitySettingsRoutes.delete('/', async (_req, res) => {
  const settings = getSettings();
  settings.streamingAvailability.apiKey = '';
  await settings.save();

  return res.status(204).send();
});

export default streamingAvailabilitySettingsRoutes;
