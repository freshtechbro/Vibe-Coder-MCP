import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { extensionUtils } from '@/lib/utils';
import { mcpBridge } from '@/lib/mcp-bridge';
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
  Send
} from 'lucide-react';
import '../src/styles/globals.css';

interface ToolCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  progress?: number;
  isActive?: boolean;
}

const ToolCard: React.FC<ToolCardProps> = ({ 
  icon, 
  title, 
  description, 
  onClick, 
  progress,
  isActive = false 
}) => (
  <Card className={`cursor-pointer transition-all duration-300 hover:shadow-md ${
    isActive ? 'ring-2 ring-blue-400 bg-blue-50/80' : ''
  }`} onClick={onClick}>
    <CardHeader className="pb-2 pt-3">
      <div className="flex items-center space-x-3">
        <div className="p-1.5 rounded-lg bg-gradient-primary text-white">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <CardTitle className="text-sm font-medium truncate">{title}</CardTitle>
          <CardDescription className="text-xs text-slate-500 truncate">{description}</CardDescription>
        </div>
      </div>
    </CardHeader>
    {progress !== undefined && (
      <CardContent className="pt-0 pb-3">
        <Progress value={progress} className="h-1.5" />
        <p className="text-xs text-slate-500 mt-1">{progress}% complete</p>
      </CardContent>
    )}
  </Card>
);

const PopupApp: React.FC = () => {
  const [isConnected, setIsConnected] = React.useState<boolean>(false);
  const [isConnecting, setIsConnecting] = React.useState<boolean>(false);

  React.useEffect(() => {
    // Check connection status
    setIsConnected(mcpBridge.isConnected());
    
    // Try to connect on startup
    if (!mcpBridge.isConnected()) {
      handleConnect();
    }
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await mcpBridge.connect();
      setIsConnected(true);
    } catch (error) {
      console.error('Failed to connect to MCP server:', error);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    mcpBridge.disconnect();
    setIsConnected(false);
  };

  const handleOpenSidePanel = async () => {
    try {
      await extensionUtils.openSidePanel();
      window.close(); // Close popup after opening side panel
    } catch (error) {
      console.error('Failed to open side panel:', error);
    }
  };

  const handleToolAction = async (tool: string) => {
    try {
      if (!isConnected) {
        await handleConnect();
      }

      // For now, just open side panel - actual tool execution will be implemented in side panel
      await handleOpenSidePanel();
      
      // Send message to side panel about which tool to execute
      await extensionUtils.sendMessage({
        type: 'TOOL_SELECTED',
        tool,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`Failed to execute ${tool}:`, error);
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
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center space-x-2">
          <div className="p-2 rounded-xl bg-gradient-primary text-white">
            <Zap size={24} />
          </div>
          <h1 className="text-2xl font-light text-slate-800">Repotools</h1>
        </div>
        <p className="text-sm text-slate-600">AI-powered development tools</p>
      </div>

      {/* Connection Status */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-400' : 'bg-red-400'
            }`} />
            <span className="text-sm text-slate-700">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={isConnected ? handleDisconnect : handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? 'Connecting...' : (isConnected ? 'Disconnect' : 'Connect')}
          </Button>
        </div>
      </Card>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-lg font-light text-slate-800">Quick Actions</h2>
        
        <Button 
          className="w-full justify-start space-x-3" 
          variant="glass"
          onClick={handleOpenSidePanel}
        >
          <FileText size={18} />
          <span>Open Side Panel</span>
        </Button>

        <div className="grid grid-cols-1 gap-2 max-h-[400px] overflow-y-auto">
          {tools.map((tool) => (
            <ToolCard
              key={tool.id}
              icon={tool.icon}
              title={tool.title}
              description={tool.description}
              onClick={() => handleToolAction(tool.id)}
              progress={tool.progress}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center pt-4 border-t border-white/20">
        <Button variant="ghost" size="sm">
          <Settings size={16} />
        </Button>
        <p className="text-xs text-slate-500">v1.0.0</p>
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
