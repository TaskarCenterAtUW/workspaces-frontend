import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { toast } from 'vue3-toastify';

export function handleFileDrop(
  event: DragEvent,
  targetRef: Ref<string | undefined>,
  isDraggingRef: Ref<boolean>,
) {
  isDraggingRef.value = false;
  const files = event.dataTransfer?.files;
  if (files && files[0]) {
    const file = files[0];
    if (!file.type.includes('json') && !file.name.endsWith('.json')) {
      toast.error('Please drop a valid JSON file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') {
        try {
          const parsed = JSON.parse(e.target.result);
          targetRef.value = JSON.stringify(parsed, null, 2);
          toast.success('JSON file loaded successfully.');
        }
        catch {
          targetRef.value = e.target.result;
          toast.warn('The selected file is not valid JSON.');
        }
      }
    };
    reader.onerror = () => {
      toast.error('Failed to read the file.');
    };
    reader.readAsText(file);
  }
}

export async function validateJson(
  jsonString: string | undefined,
  schemaUrl: string,
  cachedSchema: Ref<{ version?: number }>,
  definitionName: string,
): Promise<{ data: object | null; error: string | null }> {
  if (!jsonString) {
    return { data: null, error: null };
  }

  try {
    if (!cachedSchema.value) {
      const schemaResponse = await fetch(schemaUrl);
      if (!schemaResponse.ok) {
        throw new Error(
          `Could not fetch ${definitionName.toLowerCase()} schema: ${
            schemaResponse.statusText
          }`,
        );
      }
      cachedSchema.value = await schemaResponse.json();
      // Remove "version" from the schema if exists. We have version in long
      // form quest schema which is creating problem while validating with
      // json.
      if (cachedSchema.value.version) {
        delete cachedSchema.value.version;
      }
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(jsonString);
    }
    catch (e: unknown) {
      let error = `${definitionName} is not valid JSON`;

      if (typeof e === 'object' && e && 'message' in e) {
        error += `: ${e.message}`;
      }

      return { data: null, error };
    }

    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(cachedSchema.value);
    const valid = validate(parsedJson);
    if (!valid) {
      return {
        data: null,
        error: `${definitionName} JSON is not valid: ${ajv.errorsText(
          validate.errors,
        )}`,
      };
    }

    return { data: parsedJson, error: null };
  }
  catch (e: unknown) {
    let error = `Failed to validate ${definitionName.toLowerCase()}`;

    if (typeof e === 'object' && e && 'message' in e) {
      error += `: ${e.message}`;
    }

    return { data: null, error };
  }
}
