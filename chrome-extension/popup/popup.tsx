import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { extensionUtils } from '@/lib/extension-utils';
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



const PopupApp: React.FC = () => {
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



  const handleOpenSidePanel = async () => {
    try {
      await extensionUtils.openSidePanel();
      window.close(); // Close popup after opening side panel
    } catch (error) {
      console.error('Failed to open side panel:', error);
    }
  };

  const handleOpenSettings = () => {
    // Open settings page
    chrome.runtime.openOptionsPage();
    window.close();
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
      icon: <Search size={20} />,
      title: 'Research',
      description: 'Research and analyze topics',
      progress: undefined,
    },
    {
      id: 'generate-rules',
      icon: <Shield size={20} />,
      title: 'Generate Rules',
      description: 'Generate project rules and guidelines',
      progress: undefined,
    },
    {
      id: 'generate-prd',
      icon: <FileCode size={20} />,
      title: 'Generate PRD',
      description: 'Generate Product Requirements Document',
      progress: undefined,
    },
    {
      id: 'generate-user-stories',
      icon: <Users size={20} />,
      title: 'Generate User Stories',
      description: 'Create user stories for features',
      progress: undefined,
    },
    {
      id: 'generate-task-list',
      icon: <CheckSquare size={20} />,
      title: 'Generate Task List',
      description: 'Generate comprehensive task lists',
      progress: undefined,
    },
    {
      id: 'generate-fullstack-starter-kit',
      icon: <Package size={20} />,
      title: 'Generate Fullstack Starter Kit',
      description: 'Create fullstack project templates',
      progress: undefined,
    },
    {
      id: 'run-workflow',
      icon: <Play size={20} />,
      title: 'Run Workflow',
      description: 'Execute automated workflows',
      progress: undefined,
    },
    {
      id: 'get-job-result',
      icon: <Download size={20} />,
      title: 'Get Job Result',
      description: 'Retrieve job execution results',
      progress: undefined,
    },
    {
      id: 'map-codebase',
      icon: <Map size={20} />,
      title: 'Map Codebase',
      description: 'Generate semantic code maps',
      progress: undefined,
    },
    {
      id: 'vibe-task-manager',
      icon: <Brain size={20} />,
      title: 'Vibe Task Manager',
      description: 'AI-powered task management',
      progress: undefined,
    },
    {
      id: 'curate-context',
      icon: <FileText size={20} />,
      title: 'Curate Context',
      description: 'Curate intelligent project context',
      progress: undefined,
    },
    {
      id: 'register-agent',
      icon: <UserPlus size={20} />,
      title: 'Register Agent',
      description: 'Register AI agents for tasks',
      progress: undefined,
    },
    {
      id: 'get-agent-tasks',
      icon: <ListTodo size={20} />,
      title: 'Get Agent Tasks',
      description: 'Retrieve tasks for agents',
      progress: undefined,
    },
    {
      id: 'submit-task-response',
      icon: <Send size={20} />,
      title: 'Submit Task Response',
      description: 'Submit agent task responses',
      progress: undefined,
    },
  ];

  return (
    <div className="w-[480px] h-[700px] p-6 space-y-4 bg-gradient-to-br from-slate-50 to-blue-50 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-2 rounded-xl bg-gradient-primary text-white">
            <Zap size={24} />
          </div>
          <h1 className="text-xl font-light text-slate-800">Repotools</h1>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" onClick={handleOpenSidePanel}>
            <Plus size={16} />
          </Button>
          <Button variant="ghost" size="sm">
            <Clock size={16} />
          </Button>
          <Button variant="ghost" size="sm">
            <Gamepad2 size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleOpenSettings}>
            <Settings size={16} />
          </Button>
        </div>
      </div>

      {/* Main Input Section */}
      <Card className="p-4 space-y-4">
        {/* Tools Dropdown and File Attachment */}
        <div className="flex items-center space-x-2">
          <Select value={selectedTool} onValueChange={setSelectedTool}>
            <SelectTrigger className="flex-1 bg-white/60 backdrop-blur-md border border-white/30">
              <SelectValue placeholder="Select a tool..." />
            </SelectTrigger>
            <SelectContent className="bg-white/95 backdrop-blur-md border border-white/30">
              {tools.map((tool) => (
                <SelectItem key={tool.id} value={tool.id} className="flex items-center space-x-2">
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
                <Paperclip size={16} />
              </label>
            </Button>
          </div>
        </div>

        {/* Attached Files */}
        {attachedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">Attached Files:</p>
            <div className="flex flex-wrap gap-2">
              {attachedFiles.map((file, index) => (
                <div key={index} className="flex items-center space-x-1 bg-slate-100 rounded-lg px-2 py-1 text-xs">
                  <span>{file.name}</span>
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
          className="bg-white/60 backdrop-blur-md border border-white/30"
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
          className="w-full"
          variant="default"
        >
          {isExecuting ? 'Executing...' : 'Send'}
        </Button>
      </Card>

      {/* Output Section */}
      {output && (
        <Card className="p-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-700">Output:</h3>
            <Textarea
              value={output}
              readOnly
              className="min-h-[120px] bg-slate-50 border border-slate-200 text-sm font-mono"
            />
          </div>
        </Card>
      )}

      {/* Connection Status */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <span>v1.0.0</span>
      </div>

    </div>
  );
};

// Initialize the popup
const container = document.getElementById('popup-root');
if (container) {
  const root = createRoot(container);
  root.render(<PopupApp />);
}
