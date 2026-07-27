import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { WorkspaceContext, useWorkspace } from '../context/WorkspaceContext';
import { LlmSettingsContext, useLlmSettings } from '../context/LlmSettingsContext';
import { saveLlmSettings, loadLlmSettings } from '../lib/llmSettingsStorage';

// Types for LLM configuration
interface LlmConfig {
  provider: 'ollama' | 'openrouter' | 'bedrock' | 'openai' | 'anthropic' | 'gemini';
  model: string;
}

interface LlmSettings {
  text: LlmConfig;
  image: LlmConfig;
  video: LlmConfig;
}

// Provider names for display
const providerNames = {
  ollama: 'Ollama',
  openrouter: 'OpenRouter',
  bedrock: 'AWS Bedrock',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini'
};

// Studio Page Component
const Studio: React.FC = () => {
  const { workspace, customer } = useWorkspace();
  const { llmSettings, updateLlmSettings } = useLlmSettings();
  const [generatedText, setGeneratedText] = useState<string>('');
  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'text' | 'image' | 'video'>('text');

  // Get active provider for current capability
  const getActiveProvider = (capability: 'text' | 'image' | 'video') => {
    const settings = llmSettings[capability];
    return providerNames[settings.provider] || settings.provider;
  };

  const getActiveModel = (capability: 'text' | 'image' | 'video') => {
    return llmSettings[capability].model;
  };

  // Auto-load settings when workspace changes
  useEffect(() => {
    if (customer?.id) {
      const stored = loadLlmSettings(customer.id);
      if (stored) {
        updateLlmSettings(stored);
      }
    }
  }, [customer?.id, updateLlmSettings]);

  // Save settings when they change
  useEffect(() => {
    if (customer?.id && llmSettings) {
      saveLlmSettings(customer.id, llmSettings);
    }
  }, [llmSettings, customer?.id]);

  const handleGenerate = async () => {
    if (!inputText.trim() || !workspace?.id) return;
    
    setIsLoading(true);
    try {
      const settings = llmSettings[activeTab];
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: inputText,
          capability: activeTab,
          provider: settings.provider,
          model: settings.model,
          workspaceId: workspace.id
        })
      });
      
      if (!response.ok) throw new Error('Generation failed');
      
      const data = await response.json();
      setGeneratedText(data.result);
    } catch (error) {
      console.error('Generation error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProviderChange = (capability: 'text' | 'image' | 'video', provider: LlmConfig['provider']) => {
    updateLlmSettings({
      ...llmSettings,
      [capability]: {
        ...llmSettings[capability],
        provider
      }
    });
  };

  const handleModelChange = (capability: 'text' | 'image' | 'video', model: string) => {
    updateLlmSettings({
      ...llmSettings,
      [capability]: {
        ...llmSettings[capability],
        model
      }
    });
  };

  return (
    <div className="studio-page">
      <h1>Studio</h1>
      
      {/* Capability Tabs */}
      <div className="capability-tabs">
        <button
          className={activeTab === 'text' ? 'active' : ''}
          onClick={() => setActiveTab('text')}
        >
          Text
        </button>
        <button
          className={activeTab === 'image' ? 'active' : ''}
          onClick={() => setActiveTab('image')}
        >
          Image
        </button>
        <button
          className={activeTab === 'video' ? 'active' : ''}
          onClick={() => setActiveTab('video')}
        >
          Video
        </button>
      </div>

      {/* Active Provider Badge */}
      <div className="active-provider-badge">
        <span className="badge-label">Active provider:</span>
        <span className="provider-name">{getActiveProvider(activeTab)}</span>
        <span className="model-name">{getActiveModel(activeTab)}</span>
      </div>

      {/* Input Area */}
      <div className="input-area">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={`Enter prompt for ${activeTab} generation...`}
          className="prompt-input"
        />
      </div>

      {/* Generate Button */}
      <div className="generate-section">
        <button
          onClick={handleGenerate}
          disabled={!inputText.trim() || isLoading}
          className="generate-button"
        >
          {isLoading ? 'Generating...' : 'Generate'}
        </button>
      </div>

      {/* Generated Content */}
      {generatedText && (
        <div className="generated-content">
          <h3>Generated Content:</h3>
          <div className="output">
            {activeTab === 'text' ? (
              <p>{generatedText}</p>
            ) : (
              <div className="generated-media">
                {activeTab === 'image' ? (
                  <img src={generatedText} alt="Generated image" />
                ) : (
                  <video controls src={generatedText} />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Provider Settings Section */}
      <div className="provider-settings">
        <h3>Provider Settings</h3>
        
        <div className="capability-config">
          <h4>Text Generation</h4>
          <select
            value={llmSettings.text.provider}
            onChange={(e) => handleProviderChange('text', e.target.value as LlmConfig['provider'])}
          >
            <option value="ollama">Ollama</option>
            <option value="openrouter">OpenRouter</option>
            <option value="bedrock">AWS Bedrock</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini</option>
          </select>
          <input
            type="text"
            value={llmSettings.text.model}
            onChange={(e) => handleModelChange('text', e.target.value)}
            placeholder="Model name"
          />
        </div>

        <div className="capability-config">
          <h4>Image Generation</h4>
          <select
            value={llmSettings.image.provider}
            onChange={(e) => handleProviderChange('image', e.target.value as LlmConfig['provider'])}
          >
            <option value="ollama">Ollama</option>
            <option value="openrouter">OpenRouter</option>
            <option value="bedrock">AWS Bedrock</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini</option>
          </select>
          <input
            type="text"
            value={llmSettings.image.model}
            onChange={(e) => handleModelChange('image', e.target.value)}
            placeholder="Model name"
          />
        </div>

        <div className="capability-config">
          <h4>Video Generation</h4>
          <select
            value={llmSettings.video.provider}
            onChange={(e) => handleProviderChange('video', e.target.value as LlmConfig['provider'])}
          >
            <option value="ollama">Ollama</option>
            <option value="openrouter">OpenRouter</option>
            <option value="bedrock">AWS Bedrock</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini</option>
          </select>
          <input
            type="text"
            value={llmSettings.video.model}
            onChange={(e) => handleModelChange('video', e.target.value)}
            placeholder="Model name"
          />
        </div>
      </div>
    </div>
  );
};

export default Studio;
