import { parseMdblistListId } from '@server/api/mdblist';
import { DiscoverSliderType } from '@server/constants/discover';
import { getRepository } from '@server/datasource';
import DiscoverSlider from '@server/entity/DiscoverSlider';
import logger from '@server/logger';
import { Router } from 'express';

const discoverSettingRoutes = Router();

const normalizeSliderData = (type: DiscoverSliderType, data: unknown) => {
  if (type === DiscoverSliderType.MDBLIST) {
    try {
      return parseMdblistListId(data);
    } catch {
      throw new Error('Invalid MDBList list URL or identifier.');
    }
  }

  return typeof data === 'string' ? data : undefined;
};

discoverSettingRoutes.post('/', async (req, res) => {
  const sliderRepository = getRepository(DiscoverSlider);

  const sliders = req.body as DiscoverSlider[];

  if (!Array.isArray(sliders)) {
    return res.status(400).json({ message: 'Invalid request body.' });
  }

  try {
    for (let x = 0; x < sliders.length; x++) {
      const slider = sliders[x];
      const type = Number(slider.type) as DiscoverSliderType;
      const data = normalizeSliderData(type, slider.data);
      const existingSlider = await sliderRepository.findOne({
        where: {
          id: slider.id,
        },
      });

      if (existingSlider && slider.id) {
        existingSlider.enabled = slider.enabled;
        existingSlider.order = x;

        // Only allow changes to the following when the slider is not built in
        if (!existingSlider.isBuiltIn) {
          existingSlider.title = slider.title;
          existingSlider.data = data;
          existingSlider.type = type;
        }

        await sliderRepository.save(existingSlider);
      } else {
        const newSlider = new DiscoverSlider({
          isBuiltIn: false,
          data,
          title: slider.title,
          enabled: slider.enabled,
          order: x,
          type,
        });
        await sliderRepository.save(newSlider);
      }
    }
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }

  return res.json(sliders);
});

discoverSettingRoutes.post('/add', async (req, res) => {
  const sliderRepository = getRepository(DiscoverSlider);

  const slider = req.body as DiscoverSlider;
  const type = Number(slider.type) as DiscoverSliderType;

  let data: string | undefined;
  try {
    data = normalizeSliderData(type, slider.data);
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }

  const newSlider = new DiscoverSlider({
    isBuiltIn: false,
    data,
    title: slider.title,
    enabled: false,
    order: -1,
    type,
  });
  await sliderRepository.save(newSlider);

  return res.json(newSlider);
});

discoverSettingRoutes.get('/reset', async (_req, res) => {
  const sliderRepository = getRepository(DiscoverSlider);

  await sliderRepository.clear();
  await DiscoverSlider.bootstrapSliders();

  return res.status(204).send();
});

discoverSettingRoutes.put('/:sliderId', async (req, res, next) => {
  const sliderRepository = getRepository(DiscoverSlider);

  const slider = req.body as DiscoverSlider;

  try {
    const existingSlider = await sliderRepository.findOneOrFail({
      where: {
        id: Number(req.params.sliderId),
      },
    });

    // Only allow changes to the following when the slider is not built in
    if (!existingSlider.isBuiltIn) {
      const type = Number(slider.type) as DiscoverSliderType;
      let data: string | undefined;
      try {
        data = normalizeSliderData(type, slider.data);
      } catch (e) {
        return res.status(400).json({ message: e.message });
      }
      existingSlider.title = slider.title;
      existingSlider.data = data;
      existingSlider.type = type;
    }

    await sliderRepository.save(existingSlider);

    return res.status(200).json(existingSlider);
  } catch (e) {
    logger.error('Something went wrong updating a slider.', {
      label: 'API',
      errorMessage: e.message,
    });
    next({ status: 404, message: 'Slider not found or cannot be updated.' });
  }
});

discoverSettingRoutes.delete('/:sliderId', async (req, res, next) => {
  const sliderRepository = getRepository(DiscoverSlider);

  try {
    const slider = await sliderRepository.findOneOrFail({
      where: { id: Number(req.params.sliderId), isBuiltIn: false },
    });

    await sliderRepository.remove(slider);

    return res.status(204).send();
  } catch (e) {
    logger.error('Something went wrong deleting a slider.', {
      label: 'API',
      errorMessage: e.message,
    });
    next({ status: 404, message: 'Slider not found or cannot be deleted.' });
  }
});

export default discoverSettingRoutes;
