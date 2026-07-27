import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePrincipal } from './PrincipalContext';
import { useActiveCustomer } from './ActiveCustomerContext';
import { getLlmConfig, saveLlmConfig } from '../lib/llmSettingsStorage';
import type { LLMProvider, LLMModel } from '../lib/types';
import type { Capability } from '../lib/types';

export type LLMConfig = {
  provider: LLMProvider | null;
  model: LLMModel | null;
};

export type LLMConfigs = {
  text: LLMConfig;
  image: LLMConfig;
  video: LLMConfig;
};

export type SetLLMConfigFunction = (
  capability: Capability,
  provider: LLMProvider | null,
  model: LLMModel | null
) => void;

const initialConfigs: LLMConfigs = {
  text: { provider: null, model: null },
  image: { provider: null, model: null },
  video: { provider: null, model: null },
};

interface LlmSettingsContextType {
  configs: LLMConfigs;
  getConfig: (capability: Capability) => LLMConfig;
  setConfig: SetLLMConfigFunction;
}

const LlmSettingsContext = createContext<LlmSettingsContextType>({
  configs: initialConfigs,
  getConfig: () => ({ provider: null, model: null }),
  setConfig: () => {},
});

export const useLlmSettings = () => {
  const context = useContext(LlmSettingsContext);
  if (!context) {
    throw new Error('useLlmSettings must be used within an LlmSettingsProvider');
  }
  return context;
};

export const LlmSettingsProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { principal } = usePrincipal();
  const { activeCustomer } = useActiveCustomer();
  const [configs, setConfigs] = useState<LLMConfigs>(initialConfigs);
  const [isLoading, setIsLoading] = useState(true);

  const loadConfigs = useCallback(async () => {
    if (!principal?.id || !activeCustomer?.id) {
      setConfigs(initialConfigs);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const fetched = await getLlmConfig(principal.id, activeCustomer.id);
      setConfigs(fetched || initialConfigs);
    } catch (error) {
      console.error('Error loading LLM configs:', error);
      setConfigs(initialConfigs);
    } finally {
      setIsLoading(false);
    }
  }, [principal?.id, activeCustomer?.id]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const setConfig: SetLLMConfigFunction = useCallback(
    async (capability, provider, model) => {
      if (!principal?.id || !activeCustomer?.id) {
        return;
      }

      const newConfigs = {
        ...configs,
        [capability]: { provider, model },
      };

      setConfigs(newConfigs);

      try {
        await saveLlmConfig(principal.id, activeCustomer.id, newConfigs);
      } catch (error) {
        console.error('Error saving LLM config:', error);
        setConfigs(configs);
      }
    },
    [principal?.id, activeCustomer?.id, configs]
  );

  const getConfig = useCallback(
    (capability: Capability): LLMConfig => {
      return configs[capability];
    },
    [configs]
  );

  const value = React.useMemo(
    () => ({
      configs,
      getConfig,
      setConfig,
    }),
    [configs, getConfig, setConfig]
  );

  if (isLoading) {
    return null;
  }

  return <LlmSettingsContext.Provider value={value}>{children}</LlmSettingsContext.Provider>;
};