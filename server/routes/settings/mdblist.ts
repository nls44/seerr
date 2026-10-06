import { getSettings } from '@server/lib/settings';
import { Router } from 'express';
import { z } from 'zod';

const mdblistSettingsRoutes = Router();

const apiKeySchema = z.object({
  apiKey: z.string().trim().max(256),
});

mdblistSettingsRoutes.get('/', (_req, res) => {
  const settings = getSettings();

  // The key is deliberately never returned to the browser.
  return res.status(200).json({
    hasApiKey: Boolean(settings.mdblist.apiKey),
  });
});

mdblistSettingsRoutes.post('/', async (req, res, next) => {
  const result = apiKeySchema.safeParse(req.body);
  if (!result.success) {
    return next({ status: 400, message: 'Invalid MDBList API key.' });
  }

  const settings = getSettings();
  settings.mdblist.apiKey = result.data.apiKey;
  await settings.save();

  return res.status(200).json({
    hasApiKey: Boolean(settings.mdblist.apiKey),
  });
});

mdblistSettingsRoutes.delete('/', async (_req, res) => {
  const settings = getSettings();
  settings.mdblist.apiKey = '';
  await settings.save();

  return res.status(204).send();
});

export default mdblistSettingsRoutes;
