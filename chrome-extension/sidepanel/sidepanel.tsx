import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { mcpBridge } from '@/lib/mcp-bridge';
import { initializeErrorSuppression } from '@/utils/error-suppression';
import {
  FileText,
  Search,
  Settings,
  Zap,
  Shield,
  FileCode,
  Users,
  CheckSquare,
  Package,
  Play,
  Download,
  Map,
  Brain,
  UserPlus,
  ListTodo,
  Send,
  Paperclip,
  Plus,
  Clock,
  Gamepad2
} from 'lucide-react';
import '../src/styles/globals.css';

const SidePanelApp: React.FC = () => {
  const [isConnected, setIsConnected] = React.useState<boolean>(false);
  const [selectedTool, setSelectedTool] = React.useState<string>('');
  const [query, setQuery] = React.useState<string>('');
  const [output, setOutput] = React.useState<string>('');
  const [isExecuting, setIsExecuting] = React.useState<boolean>(false);
  const [attachedFiles, setAttachedFiles] = React.useState<File[]>([]);

  React.useEffect(() => {
    // Initialize error suppression
    initializeErrorSuppression();

    // Check connection status
    setIsConnected(mcpBridge.isConnected());

    // Try to connect on startup
    if (!mcpBridge.isConnected()) {
      handleConnect();
    }
  }, []);

  const handleConnect = async () => {
    try {
      await mcpBridge.connect();
      setIsConnected(true);
    } catch (error) {
      console.error('Failed to connect to MCP server:', error);
      setIsConnected(false);
    }
  };

  const handleOpenSettings = () => {
    // Open settings page
    chrome.runtime.openOptionsPage();
  };

  const handleFileAttachment = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setAttachedFiles(prev => [...prev, ...files]);
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleExecuteTool = async () => {
    if (!selectedTool || !query.trim()) return;

    setIsExecuting(true);
    setOutput('Executing...');

    try {
      if (!isConnected) {
        await handleConnect();
      }

      // Execute the selected tool with the query and attached files
      const result = await mcpBridge.executeTool(selectedTool, {
        query: query.trim(),
        files: attachedFiles.map(file => ({
          name: file.name,
          size: file.size,
          type: file.type
        }))
      });

      if (result.success) {
        setOutput(JSON.stringify(result.data, null, 2));
      } else {
        setOutput(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error(`Failed to execute ${selectedTool}:`, error);
      setOutput(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const tools = [
    {
      id: 'research',
      icon: <Search size={16} />,
      title: 'Research',
      description: 'Research and analyze topics',
    },
    {
      id: 'generate-rules',
      icon: <Shield size={16} />,
      title: 'Generate Rules',
      description: 'Generate project rules and guidelines',
    },
    {
      id: 'generate-prd',
      icon: <FileCode size={16} />,
      title: 'Generate PRD',
      description: 'Generate Product Requirements Document',
    },
    {
      id: 'generate-user-stories',
      icon: <Users size={16} />,
      title: 'Generate User Stories',
      description: 'Create user stories for features',
    },
    {
      id: 'generate-task-list',
      icon: <CheckSquare size={16} />,
      title: 'Generate Task List',
      description: 'Generate comprehensive task lists',
    },
    {
      id: 'generate-fullstack-starter-kit',
      icon: <Package size={16} />,
      title: 'Generate Fullstack Starter Kit',
      description: 'Create fullstack project templates',
    },
    {
      id: 'run-workflow',
      icon: <Play size={16} />,
      title: 'Run Workflow',
      description: 'Execute automated workflows',
    },
    {
      id: 'get-job-result',
      icon: <Download size={16} />,
      title: 'Get Job Result',
      description: 'Retrieve job execution results',
    },
    {
      id: 'map-codebase',
      icon: <Map size={16} />,
      title: 'Map Codebase',
      description: 'Generate semantic code maps',
    },
    {
      id: 'vibe-task-manager',
      icon: <Brain size={16} />,
      title: 'Vibe Task Manager',
      description: 'AI-powered task management',
    },
    {
      id: 'curate-context',
      icon: <FileText size={16} />,
      title: 'Curate Context',
      description: 'Curate intelligent project context',
    },
    {
      id: 'register-agent',
      icon: <UserPlus size={16} />,
      title: 'Register Agent',
      description: 'Register AI agents for tasks',
    },
    {
      id: 'get-agent-tasks',
      icon: <ListTodo size={16} />,
      title: 'Get Agent Tasks',
      description: 'Retrieve tasks for agents',
    },
    {
      id: 'submit-task-response',
      icon: <Send size={16} />,
      title: 'Submit Task Response',
      description: 'Submit agent task responses',
    },
  ];

  return (
    <div className="w-full h-screen bg-gradient-to-b from-slate-50 to-blue-50 glass-scrollbar overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-white/20 bg-white/80 backdrop-blur-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-gradient-primary text-white">
              <Zap size={20} />
            </div>
            <h1 className="text-lg font-light text-slate-800">Repotools</h1>
          </div>
          <div className="flex items-center space-x-1">
            <Button variant="ghost" size="sm">
              <Plus size={14} />
            </Button>
            <Button variant="ghost" size="sm">
              <Clock size={14} />
            </Button>
            <Button variant="ghost" size="sm">
              <Gamepad2 size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleOpenSettings}>
              <Settings size={14} />
            </Button>
          </div>
        </div>

        {/* Main Input Section */}
        <Card className="p-3 space-y-3 bg-white/60 backdrop-blur-md border border-white/30">
          {/* Tools Dropdown and File Attachment */}
          <div className="flex items-center space-x-2">
            <Select value={selectedTool} onValueChange={setSelectedTool}>
              <SelectTrigger className="flex-1 bg-white/60 backdrop-blur-md border border-white/30 h-9 text-sm">
                <SelectValue placeholder="Select a tool..." />
              </SelectTrigger>
              <SelectContent className="bg-white/95 backdrop-blur-md border border-white/30">
                {tools.map((tool) => (
                  <SelectItem key={tool.id} value={tool.id} className="flex items-center space-x-2 text-sm">
                    <div className="flex items-center space-x-2">
                      {tool.icon}
                      <span>{tool.title}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative">
              <input
                type="file"
                multiple
                onChange={handleFileAttachment}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                id="file-input"
              />
              <Button variant="outline" size="sm" asChild>
                <label htmlFor="file-input" className="cursor-pointer">
                  <Paperclip size={14} />
                </label>
              </Button>
            </div>
          </div>

          {/* Attached Files */}
          {attachedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-600">Attached Files:</p>
              <div className="flex flex-wrap gap-1">
                {attachedFiles.map((file, index) => (
                  <div key={index} className="flex items-center space-x-1 bg-slate-100 rounded-lg px-2 py-1 text-xs">
                    <span className="truncate max-w-[120px]">{file.name}</span>
                    <button
                      onClick={() => removeAttachedFile(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Query Input */}
          <Input
            placeholder="What can I help you with?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-white/60 backdrop-blur-md border border-white/30 h-9 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleExecuteTool();
              }
            }}
          />

          {/* Execute Button */}
          <Button
            onClick={handleExecuteTool}
            disabled={!selectedTool || !query.trim() || isExecuting}
            className="w-full h-9 text-sm"
            variant="default"
          >
            {isExecuting ? 'Executing...' : 'Send'}
          </Button>
        </Card>
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-4 flex-1">
        {/* Output Section */}
        {output && (
          <Card className="p-3 bg-white/60 backdrop-blur-md border border-white/30">
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-700">Output:</h3>
              <Textarea
                value={output}
                readOnly
                className="min-h-[120px] bg-slate-50 border border-slate-200 text-xs font-mono resize-none"
              />
            </div>
          </Card>
        )}

        {/* Quick Start Section */}
        <Card className="p-4 bg-white/60 backdrop-blur-md border border-white/30">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Quick Start</h3>
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-xs text-slate-600">
              <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-[10px]">1</div>
              <span>Select an AI tool from the dropdown</span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-slate-600">
              <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-[10px]">2</div>
              <span>Attach files if needed (optional)</span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-slate-600">
              <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-[10px]">3</div>
              <span>Enter your query or request</span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-slate-600">
              <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-[10px]">4</div>
              <span>Click Send to execute</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/20 bg-white/80 backdrop-blur-md">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <span>v1.0.0</span>
        </div>
      </div>
    </div>
  );
};

// Initialize the side panel
const container = document.getElementById('sidepanel-root');
if (container) {
  const root = createRoot(container);
  root.render(<SidePanelApp />);
}
