import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { extensionUtils } from '@/lib/utils';
import { 
  Settings, 
  Server, 
  Palette, 
  Shield, 
  Bell,
  Save,
  RotateCcw,
  ExternalLink
} from 'lucide-react';
import '../src/styles/globals.css';

interface SettingsState {
  serverUrl: string;
  autoConnect: boolean;
  theme: 'light' | 'dark' | 'auto';
  notifications: boolean;
  githubIntegration: boolean;
  maxConcurrentTasks: number;
  cacheEnabled: boolean;
  debugMode: boolean;
}

const OptionsApp: React.FC = () => {
  const [settings, setSettings] = React.useState<SettingsState>({
    serverUrl: 'http://localhost:3001',
    autoConnect: true,
    theme: 'light',
    notifications: true,
    githubIntegration: true,
    maxConcurrentTasks: 3,
    cacheEnabled: true,
    debugMode: false,
  });

  const [isSaving, setIsSaving] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'success' | 'error'>('idle');

  React.useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const result = await extensionUtils.getStorage(['settings']);
      if ((result as any).settings) {
        setSettings(prev => ({ ...prev, ...(result as any).settings }));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      await extensionUtils.setStorage({ settings });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const resetSettings = () => {
    setSettings({
      serverUrl: 'http://localhost:3001',
      autoConnect: true,
      theme: 'light',
      notifications: true,
      githubIntegration: true,
      maxConcurrentTasks: 3,
      cacheEnabled: true,
      debugMode: false,
    });
  };

  const testConnection = async () => {
    try {
      const response = await fetch(`${settings.serverUrl}/health`);
      if (response.ok) {
        alert('Connection successful!');
      } else {
        alert('Server responded but may not be healthy');
      }
    } catch (error) {
      alert(`Connection failed: ${  (error as Error).message}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center space-x-3">
          <div className="p-3 rounded-2xl bg-gradient-primary text-white">
            <Settings size={32} />
          </div>
          <h1 className="text-3xl font-light text-slate-800">Repotools Settings</h1>
        </div>
        <p className="text-slate-600 max-w-2xl mx-auto">
          Configure your Repotools extension to optimize your development workflow
        </p>
      </div>

      {/* Server Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Server size={24} className="text-blue-600" />
            <div>
              <CardTitle>Server Configuration</CardTitle>
              <CardDescription>
                Configure connection to the Repotools lightweight server
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">Server URL</label>
            <div className="flex space-x-3">
              <Input
                placeholder="http://localhost:3001"
                value={settings.serverUrl}
                onChange={(e) => setSettings(prev => ({ ...prev, serverUrl: e.target.value }))}
                className="flex-1"
              />
              <Button variant="outline" onClick={testConnection}>
                Test Connection
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-slate-800">Auto-connect on startup</h4>
              <p className="text-sm text-slate-600">
                Automatically connect to server when extension starts
              </p>
            </div>
            <Button
              variant={settings.autoConnect ? "default" : "outline"}
              onClick={() => setSettings(prev => ({ ...prev, autoConnect: !prev.autoConnect }))}
            >
              {settings.autoConnect ? 'Enabled' : 'Disabled'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Palette size={24} className="text-purple-600" />
            <div>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize the look and feel of the extension
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">Theme</label>
            <div className="flex space-x-3">
              {(['light', 'dark', 'auto'] as const).map((theme) => (
                <Button
                  key={theme}
                  variant={settings.theme === theme ? "default" : "outline"}
                  onClick={() => setSettings(prev => ({ ...prev, theme }))}
                  className="capitalize"
                >
                  {theme}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Features */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Shield size={24} className="text-green-600" />
            <div>
              <CardTitle>Features</CardTitle>
              <CardDescription>
                Enable or disable specific extension features
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-slate-800">GitHub Integration</h4>
              <p className="text-sm text-slate-600">
                Show Repotools button on GitHub repository pages
              </p>
            </div>
            <Button
              variant={settings.githubIntegration ? "default" : "outline"}
              onClick={() => setSettings(prev => ({ ...prev, githubIntegration: !prev.githubIntegration }))}
            >
              {settings.githubIntegration ? 'Enabled' : 'Disabled'}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-slate-800">Notifications</h4>
              <p className="text-sm text-slate-600">
                Show notifications for task completion and errors
              </p>
            </div>
            <Button
              variant={settings.notifications ? "default" : "outline"}
              onClick={() => setSettings(prev => ({ ...prev, notifications: !prev.notifications }))}
            >
              {settings.notifications ? 'Enabled' : 'Disabled'}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-slate-800">Cache</h4>
              <p className="text-sm text-slate-600">
                Cache results to improve performance
              </p>
            </div>
            <Button
              variant={settings.cacheEnabled ? "default" : "outline"}
              onClick={() => setSettings(prev => ({ ...prev, cacheEnabled: !prev.cacheEnabled }))}
            >
              {settings.cacheEnabled ? 'Enabled' : 'Disabled'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Performance */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Bell size={24} className="text-orange-600" />
            <div>
              <CardTitle>Performance</CardTitle>
              <CardDescription>
                Optimize extension performance and resource usage
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">
              Maximum Concurrent Tasks: {settings.maxConcurrentTasks}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={settings.maxConcurrentTasks}
              onChange={(e) => setSettings(prev => ({ 
                ...prev, 
                maxConcurrentTasks: parseInt(e.target.value) 
              }))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>1</span>
              <span>10</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-slate-800">Debug Mode</h4>
              <p className="text-sm text-slate-600">
                Enable detailed logging for troubleshooting
              </p>
            </div>
            <Button
              variant={settings.debugMode ? "default" : "outline"}
              onClick={() => setSettings(prev => ({ ...prev, debugMode: !prev.debugMode }))}
            >
              {settings.debugMode ? 'Enabled' : 'Disabled'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between items-center pt-8 border-t border-white/20">
        <div className="flex space-x-3">
          <Button variant="outline" onClick={resetSettings}>
            <RotateCcw size={16} className="mr-2" />
            Reset to Defaults
          </Button>
          <Button variant="ghost" onClick={() => window.open('https://github.com/freshtechbro/Repotools', '_blank')}>
            <ExternalLink size={16} className="mr-2" />
            Documentation
          </Button>
        </div>

        <Button 
          onClick={saveSettings} 
          disabled={isSaving}
          variant={saveStatus === 'success' ? 'default' : saveStatus === 'error' ? 'destructive' : 'default'}
        >
          <Save size={16} className="mr-2" />
          {isSaving ? 'Saving...' : 
           saveStatus === 'success' ? 'Saved!' : 
           saveStatus === 'error' ? 'Error!' : 
           'Save Settings'}
        </Button>
      </div>

      {/* Footer */}
      <div className="text-center pt-8 text-sm text-slate-500">
        <p>Repotools v1.0.0 • Made with ❤️ for developers</p>
      </div>
    </div>
  );
};

// Initialize the options page
const container = document.getElementById('options-root');
if (container) {
  const root = createRoot(container);
  root.render(<OptionsApp />);
}
