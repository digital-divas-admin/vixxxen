/**
 * Image Generation Page
 * Generate images with Seedream and Nano Banana Pro
 */

import { useState, useEffect } from 'react';
import { Image, Loader2, Download, Zap, Trash2 } from 'lucide-react';
import { Layout, PageHeader, Card } from '../components/layout/Layout';
import { Button } from '../components/common/Button';
import { Input, Textarea } from '../components/common/Input';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

const MODELS = [
  { id: 'seedream', name: 'Seedream 4.5', credits: 10, description: 'High quality, supports NSFW' },
  { id: 'nano-banana', name: 'Nano Banana Pro', credits: 8, description: 'Fast, great for SFW content' },
];

const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1 Square', width: 2048, height: 2048 },
  { id: '16:9', label: '16:9 Landscape', width: 2560, height: 1440 },
  { id: '9:16', label: '9:16 Portrait', width: 1440, height: 2560 },
  { id: '4:3', label: '4:3 Standard', width: 2240, height: 1680 },
];

export function ImageGenPage() {
  const { credits, refreshCredits } = useAuth();
  const [model, setModel] = useState('seedream');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [numOutputs, setNumOutputs] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [images, setImages] = useState(() => {
    // Load persisted images from localStorage on init
    try {
      const saved = localStorage.getItem('agency-studio-images');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persist images to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('agency-studio-images', JSON.stringify(images));
  }, [images]);

  const selectedModel = MODELS.find(m => m.id === model);
  const selectedRatio = ASPECT_RATIOS.find(r => r.id === aspectRatio);
  const totalCost = (selectedModel?.credits || 0) * numOutputs;

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const endpoint = model === 'seedream' ? '/api/generate/seedream' : '/api/generate/nano-banana';

      const body = model === 'seedream'
        ? {
            prompt,
            width: selectedRatio.width,
            height: selectedRatio.height,
            numOutputs,
          }
        : {
            prompt,
            aspectRatio,
            numOutputs,
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token') ? JSON.parse(localStorage.getItem('supabase.auth.token')).access_token : ''}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      // Create image objects with metadata and prepend to existing images
      const newImages = (data.images || []).map((url, idx) => ({
        id: `${Date.now()}-${idx}`,
        url,
        prompt,
        model: selectedModel.name,
        aspectRatio,
        createdAt: new Date().toISOString(),
      }));

      setImages(prev => [...newImages, ...prev]);
      refreshCredits();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const clearImages = () => {
    if (confirm('Clear all generated images?')) {
      setImages([]);
    }
  };

  const deleteImage = (id) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const downloadImage = async (imageUrl, index) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated-${Date.now()}-${index}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Image Generation"
        description="Create AI-generated images with multiple models"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="lg:col-span-1 space-y-4">
          {/* Model Selection */}
          <Card>
            <h3 className="font-semibold text-text mb-3">Model</h3>
            <div className="space-y-2">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    model === m.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-text">{m.name}</p>
                      <p className="text-sm text-text-muted">{m.description}</p>
                    </div>
                    <span className="text-sm text-primary font-medium">{m.credits} credits</span>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* Aspect Ratio */}
          <Card>
            <h3 className="font-semibold text-text mb-3">Aspect Ratio</h3>
            <div className="grid grid-cols-2 gap-2">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio.id}
                  onClick={() => setAspectRatio(ratio.id)}
                  className={`p-2 rounded-lg border text-sm transition-colors ${
                    aspectRatio === ratio.id
                      ? 'border-primary bg-primary/10 text-text'
                      : 'border-border text-text-muted hover:border-primary/50'
                  }`}
                >
                  {ratio.label}
                </button>
              ))}
            </div>
          </Card>

          {/* Number of Images */}
          <Card>
            <h3 className="font-semibold text-text mb-3">Number of Images</h3>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setNumOutputs(n)}
                  className={`flex-1 p-2 rounded-lg border text-sm transition-colors ${
                    numOutputs === n
                      ? 'border-primary bg-primary/10 text-text'
                      : 'border-border text-text-muted hover:border-primary/50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </Card>

          {/* Cost Summary */}
          <Card className="bg-surface-elevated">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <span className="text-text-muted">Total Cost</span>
              </div>
              <span className="text-xl font-bold text-text">{totalCost} credits</span>
            </div>
            <p className="text-sm text-text-muted mt-1">
              Available: {credits?.agencyPool?.toLocaleString() || 0} credits
            </p>
          </Card>
        </div>

        {/* Prompt and Results */}
        <div className="lg:col-span-2 space-y-4">
          {/* Prompt Input */}
          <Card>
            <Textarea
              label="Prompt"
              placeholder="Describe the image you want to generate..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
            />

            {error && (
              <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                {error}
              </div>
            )}

            <Button
              onClick={handleGenerate}
              loading={loading}
              disabled={!prompt.trim() || loading}
              className="w-full mt-4"
            >
              {loading ? 'Generating...' : `Generate (${totalCost} credits)`}
            </Button>
          </Card>

          {/* Results */}
          {loading && (
            <Card>
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-text-muted">Generating your images...</p>
                <p className="text-sm text-text-muted mt-1">This may take 30-60 seconds</p>
              </div>
            </Card>
          )}

          {images.length > 0 && (
            <>
              <div className="flex justify-between items-center">
                <p className="text-sm text-text-muted">{images.length} image{images.length !== 1 ? 's' : ''} generated</p>
                <Button variant="ghost" size="sm" onClick={clearImages}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {images.map((image) => (
                  <Card key={image.id} className="p-2">
                    <div className="relative group">
                      <img
                        src={image.url}
                        alt={image.prompt}
                        className="w-full rounded-lg"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => downloadImage(image.url, image.id)}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteImage(image.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-white text-xs truncate">{image.prompt}</p>
                        <p className="text-white/60 text-xs">{image.model}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}

          {!loading && images.length === 0 && (
            <Card>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Image className="h-12 w-12 text-text-muted mb-4" />
                <p className="text-text-muted">Your generated images will appear here</p>
                <p className="text-sm text-text-muted mt-1">
                  Enter a prompt and click Generate to get started
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}
