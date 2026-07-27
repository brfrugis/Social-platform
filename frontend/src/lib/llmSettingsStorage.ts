import axios from 'axios';
import type { LLMConfigs } from '../context/LlmSettingsContext';

const API_BASE = '/api/tenants';

interface BackendLLMConfig {
  provider: string | null;
  model: string | null;
}

interface BackendLLMConfigs {
  text: BackendLLMConfig;
  image: BackendLLMConfig;
  video: BackendLLMConfig;
}

const parseBackendConfigs = (backend: BackendLLMConfigs): LLMConfigs => ({
  text: {
    provider: backend.text.provider ?? null,
    model: backend.text.model ?? null,
  },
  image: {
    provider: backend.image.provider ?? null,
    model: backend.image.model ?? null,
  },
  video: {
    provider: backend.video.provider ?? null,
    model: backend.video.model ?? null,
  },
});

const encodeStorageKey = (principalId: number, customerId: number, capability: string) =>
  `llm_${principalId}_${customerId}_${capability}`;

export const loadFromLocalStorage = (principalId: number, customerId: number): LLMConfigs | null => {
  try {
    const text = localStorage.getItem(encodeStorageKey(principalId, customerId, 'text'));
    const image = localStorage.getItem(encodeStorageKey(principalId, customerId, 'image'));
    const video = localStorage.getItem(encodeStorageKey(principalId, customerId, 'video'));

    if (!text || !image || !video) {
      return null;
    }

    return {
      text: JSON.parse(text),
      image: JSON.parse(image),
      video: JSON.parse(video),
    };
  } catch {
    return null;
  }
};

export const saveToLocalStorage = (principalId: number, customerId: number, configs: LLMConfigs) => {
  try {
    localStorage.setItem(encodeStorageKey(principalId, customerId, 'text'), JSON.stringify(configs.text));
    localStorage.setItem(encodeStorageKey(principalId, customerId, 'image'), JSON.stringify(configs.image));
    localStorage.setItem(encodeStorageKey(principalId, customerId, 'video'), JSON.stringify(configs.video));
  } catch (e) {
    console.error('Failed to save LLM configs to localStorage:', e);
  }
};

export const getLlmConfig = async (principalId: number, customerId: number): Promise<LLMConfigs | null> => {
  try {
    const stored = loadFromLocalStorage(principalId, customerId);
    if (stored) {
      return stored;
    }

    const response = await axios.get<BackendLLMConfigs>(`${API_BASE}/${customerId}/llm-config`, {
      headers: {
        'X-Principal-Id': String(principalId),
      },
    });

    const parsed = parseBackendConfigs(response.data);
    saveToLocalStorage(principalId, customerId, parsed);
    return parsed;
  } catch (error) {
    console.error('Error fetching LLM config from backend:', error);
    return loadFromLocalStorage(principalId, customerId);
  }
};

export const saveLlmConfig = async (principalId: number, customerId: number, configs: LLMConfigs) => {
  try {
    const backendData: BackendLLMConfigs = {
      text: {
        provider: configs.text.provider ?? null,
        model: configs.text.model ?? null,
      },
      image: {
        provider: configs.image.provider ?? null,
        model: configs.image.model ?? null,
      },
      video: {
        provider: configs.video.provider ?? null,
        model: configs.video.model ?? null,
      },
    };

    await axios.post(`${API_BASE}/${customerId}/llm-config`, backendData, {
      headers: {
        'X-Principal-Id': String(principalId),
      },
    });

    saveToLocalStorage(principalId, customerId, configs);
  } catch (error) {
    console.error('Error saving LLM config to backend:', error);
    throw error;
  }
};