import { parseProjectWizardCustomImagery } from '~/services/project-wizard-payload';
import { validateJson } from '~/util/schema';

import type { ProjectWizardCustomImagery } from '~/types/project-wizard';

export async function validateProjectCustomImagery(
  customImagery: string,
  schemaUrl: string,
  cachedSchema: Ref<object | undefined>,
): Promise<{ data: ProjectWizardCustomImagery | null; error: string | null }> {
  let parsedImagery: ProjectWizardCustomImagery | null;

  try {
    parsedImagery = parseProjectWizardCustomImagery(customImagery);
  }
  catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Custom imagery is not valid JSON.',
    };
  }

  if (!parsedImagery) {
    return { data: null, error: null };
  }

  const result = await validateJson(
    JSON.stringify([parsedImagery]),
    schemaUrl,
    cachedSchema,
    'Custom imagery',
  );

  return result.error
    ? { data: null, error: result.error }
    : { data: parsedImagery, error: null };
}
