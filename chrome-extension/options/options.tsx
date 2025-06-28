import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { extensionUtils } from '@/lib/extension-utils';
import { initializeErrorSuppression } from '@/utils/error-suppression';
import {
  Settings,
  Server,
  Palette,
  Shield,
  Bell,
  Save,
  RotateCcw,
  ExternalLink,
  Wrench,
  Search,
  FileCode,
  Users,
  CheckSquare,
  Package,
  Play,
  Download,
  Map,
  Brain,
  FileText,
  UserPlus,
  ListTodo,
  Send
} from 'lucide-react';
import '../src/styles/globals.css';

interface ToolConfig {
  enabled: boolean;
  maxTokens: number;
  temperature: number;
  model: string;
  customPrompt: string;
  outputFormat: 'json' | 'markdown' | 'text';
  timeout: number;
}

interface SettingsState {
  serverUrl: string;
  autoConnect: boolean;
  theme: 'light' | 'dark' | 'auto';
  notifications: boolean;
  githubIntegration: boolean;
  maxConcurrentTasks: number;
  cacheEnabled: boolean;
  debugMode: boolean;
  toolConfigs: Record<string, ToolConfig>;
}

const OptionsApp: React.FC = () => {
  const defaultToolConfig: ToolConfig = {
    enabled: true,
    maxTokens: 2000,
    temperature: 0.7,
    model: 'gpt-4',
    customPrompt: '',
    outputFormat: 'markdown',
    timeout: 30000,
  };

  const tools = [
    { id: 'research', name: 'Research', icon: <Search size={16} /> },
    { id: 'generate-rules', name: 'Generate Rules', icon: <Shield size={16} /> },
    { id: 'generate-prd', name: 'Generate PRD', icon: <FileCode size={16} /> },
    { id: 'generate-user-stories', name: 'Generate User Stories', icon: <Users size={16} /> },
    { id: 'generate-task-list', name: 'Generate Task List', icon: <CheckSquare size={16} /> },
    { id: 'generate-fullstack-starter-kit', name: 'Generate Fullstack Starter Kit', icon: <Package size={16} /> },
    { id: 'run-workflow', name: 'Run Workflow', icon: <Play size={16} /> },
    { id: 'get-job-result', name: 'Get Job Result', icon: <Download size={16} /> },
    { id: 'map-codebase', name: 'Map Codebase', icon: <Map size={16} /> },
    { id: 'vibe-task-manager', name: 'Vibe Task Manager', icon: <Brain size={16} /> },
    { id: 'curate-context', name: 'Curate Context', icon: <FileText size={16} /> },
    { id: 'register-agent', name: 'Register Agent', icon: <UserPlus size={16} /> },
    { id: 'get-agent-tasks', name: 'Get Agent Tasks', icon: <ListTodo size={16} /> },
    { id: 'submit-task-response', name: 'Submit Task Response', icon: <Send size={16} /> },
  ];

  const [settings, setSettings] = React.useState<SettingsState>({
    serverUrl: 'http://localhost:3001',
    autoConnect: true,
    theme: 'light',
    notifications: true,
    githubIntegration: true,
    maxConcurrentTasks: 3,
    cacheEnabled: true,
    debugMode: false,
    toolConfigs: tools.reduce((acc, tool) => ({
      ...acc,
      [tool.id]: { ...defaultToolConfig }
    }), {}),
  });

  const [isSaving, setIsSaving] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'success' | 'error'>('idle');

  React.useEffect(() => {
    // Initialize error suppression
    initializeErrorSuppression();

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
      toolConfigs: tools.reduce((acc, tool) => ({
        ...acc,
        [tool.id]: { ...defaultToolConfig }
      }), {}),
    });
  };

  const updateToolConfig = (toolId: string, updates: Partial<ToolConfig>) => {
    setSettings(prev => ({
      ...prev,
      toolConfigs: {
        ...prev.toolConfigs,
        [toolId]: {
          ...prev.toolConfigs[toolId],
          ...updates
        }
      }
    }));
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
      alert(`Connection failed: ${(error as Error).message}`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-8">
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

      {/* Tabs */}
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general" className="flex items-center space-x-2">
            <Settings size={16} />
            <span>General</span>
          </TabsTrigger>
          <TabsTrigger value="tools" className="flex items-center space-x-2">
            <Wrench size={16} />
            <span>Tools</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center space-x-2">
            <Palette size={16} />
            <span>Appearance</span>
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center space-x-2">
            <Shield size={16} />
            <span>Advanced</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">

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

        </TabsContent>

        <TabsContent value="tools" className="space-y-6">
          {/* Tool Configurations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tools.map((tool) => (
              <Card key={tool.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {tool.icon}
                      <div>
                        <CardTitle className="text-sm">{tool.name}</CardTitle>
                        <CardDescription className="text-xs">
                          Configure {tool.name.toLowerCase()} settings
                        </CardDescription>
                      </div>
                    </div>
                    <Switch
                      checked={settings.toolConfigs[tool.id]?.enabled ?? true}
                      onCheckedChange={(enabled) => updateToolConfig(tool.id, { enabled })}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-700">Max Tokens</label>
                      <Input
                        type="number"
                        value={settings.toolConfigs[tool.id]?.maxTokens ?? 2000}
                        onChange={(e) => updateToolConfig(tool.id, { maxTokens: parseInt(e.target.value) })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-700">Temperature</label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        value={settings.toolConfigs[tool.id]?.temperature ?? 0.7}
                        onChange={(e) => updateToolConfig(tool.id, { temperature: parseFloat(e.target.value) })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-700">Output Format</label>
                    <Select
                      value={settings.toolConfigs[tool.id]?.outputFormat ?? 'markdown'}
                      onValueChange={(value: 'json' | 'markdown' | 'text') =>
                        updateToolConfig(tool.id, { outputFormat: value })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="markdown">Markdown</SelectItem>
                        <SelectItem value="json">JSON</SelectItem>
                        <SelectItem value="text">Plain Text</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-700">Custom Prompt</label>
                    <Textarea
                      placeholder="Enter custom prompt for this tool..."
                      value={settings.toolConfigs[tool.id]?.customPrompt ?? ''}
                      onChange={(e) => updateToolConfig(tool.id, { customPrompt: e.target.value })}
                      className="min-h-[60px] text-xs"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-6">
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
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">

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

        </TabsContent>
      </Tabs>

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
