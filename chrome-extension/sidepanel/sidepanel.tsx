import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { extensionUtils } from '@/lib/utils';
import { 
  Code2, 
  FileText, 
  Search, 
  Settings, 
  Zap, 
  Play, 
  Pause, 
  Square,
  Download,
  RefreshCw,
  Folder,
  File
} from 'lucide-react';
import '../src/styles/globals.css';

interface TaskProgress {
  id: string;
  name: string;
  progress: number;
  status: 'running' | 'completed' | 'paused' | 'error';
  startTime: number;
  estimatedTime?: number;
}

const SidePanelApp: React.FC = () => {
  const [tasks, setTasks] = React.useState<TaskProgress[]>([]);
  const [repoPath, setRepoPath] = React.useState<string>('');
  const [isConnected, setIsConnected] = React.useState<boolean>(false);

  React.useEffect(() => {
    // Load initial state
    extensionUtils.getStorage(['tasks', 'repoPath', 'serverConnection']).then((result: any) => {
      setTasks(result.tasks || []);
      setRepoPath(result.repoPath || '');
      setIsConnected(result.serverConnection?.connected || false);
    });

    // Listen for task updates
    const handleMessage = (message: any) => {
      if (message.type === 'TASK_UPDATE') {
        setTasks(prev => {
          const updated = [...prev];
          const index = updated.findIndex(t => t.id === message.task.id);
          if (index >= 0) {
            updated[index] = message.task;
          } else {
            updated.push(message.task);
          }
          return updated;
        });
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const handleStartTask = async (taskType: string) => {
    try {
      const newTask: TaskProgress = {
        id: `${taskType}-${Date.now()}`,
        name: taskType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        progress: 0,
        status: 'running',
        startTime: Date.now(),
      };

      setTasks(prev => [...prev, newTask]);

      await extensionUtils.sendMessage({
        type: 'START_TASK',
        taskType,
        taskId: newTask.id,
        repoPath,
      });
    } catch (error) {
      console.error('Failed to start task:', error);
    }
  };

  const handleTaskControl = async (taskId: string, action: 'pause' | 'resume' | 'stop') => {
    try {
      await extensionUtils.sendMessage({
        type: 'TASK_CONTROL',
        taskId,
        action,
      });
    } catch (error) {
      console.error('Failed to control task:', error);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getStatusColor = (status: TaskProgress['status']) => {
    switch (status) {
      case 'running': return 'text-blue-600';
      case 'completed': return 'text-green-600';
      case 'paused': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      default: return 'text-slate-600';
    }
  };

  const getStatusIcon = (status: TaskProgress['status']) => {
    switch (status) {
      case 'running': return <RefreshCw size={16} className="animate-spin" />;
      case 'completed': return <Square size={16} className="text-green-600" />;
      case 'paused': return <Pause size={16} className="text-yellow-600" />;
      case 'error': return <Square size={16} className="text-red-600" />;
      default: return <Square size={16} />;
    }
  };

  return (
    <div className="w-full h-screen bg-gradient-to-b from-white to-slate-50 glass-scrollbar overflow-y-auto">
      {/* Header */}
      <div className="glass-panel p-6 border-b border-white/20">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-gradient-primary text-white">
              <Zap size={24} />
            </div>
            <div>
              <h1 className="text-xl font-light text-slate-800">Repotools</h1>
              <p className="text-sm text-slate-600">AI Development Assistant</p>
            </div>
          </div>
          <Button variant="ghost" size="icon">
            <Settings size={20} />
          </Button>
        </div>

        {/* Connection Status */}
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-400' : 'bg-red-400'
              }`} />
              <span className="text-sm text-slate-700">
                {isConnected ? 'Server Connected' : 'Server Disconnected'}
              </span>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsConnected(!isConnected)}
            >
              {isConnected ? 'Disconnect' : 'Connect'}
            </Button>
          </div>
        </Card>

        {/* Repository Path */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-slate-700">Repository Path</label>
          <div className="flex space-x-2">
            <Input
              placeholder="/path/to/your/repository"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" size="icon">
              <Folder size={18} />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-8">
        {/* Quick Actions */}
        <section>
          <h2 className="text-lg font-light text-slate-800 mb-6">Quick Actions</h2>
          <div className="grid grid-cols-1 gap-4">
            <Button 
              className="justify-start space-x-3 h-14" 
              variant="glass"
              onClick={() => handleStartTask('code-map-generator')}
              disabled={!repoPath || !isConnected}
            >
              <Code2 size={20} />
              <div className="text-left">
                <div className="font-medium">Generate Code Map</div>
                <div className="text-xs opacity-80">Analyze repository structure</div>
              </div>
            </Button>

            <Button 
              className="justify-start space-x-3 h-14" 
              variant="glass"
              onClick={() => handleStartTask('context-curator')}
              disabled={!repoPath || !isConnected}
            >
              <FileText size={20} />
              <div className="text-left">
                <div className="font-medium">Curate Context</div>
                <div className="text-xs opacity-80">Generate project context</div>
              </div>
            </Button>

            <Button 
              className="justify-start space-x-3 h-14" 
              variant="glass"
              onClick={() => handleStartTask('research-manager')}
              disabled={!repoPath || !isConnected}
            >
              <Search size={20} />
              <div className="text-left">
                <div className="font-medium">Research Manager</div>
                <div className="text-xs opacity-80">Manage research tasks</div>
              </div>
            </Button>
          </div>
        </section>

        {/* Active Tasks */}
        <section>
          <h2 className="text-lg font-light text-slate-800 mb-6">Active Tasks</h2>
          {tasks.length === 0 ? (
            <Card className="p-8 text-center">
              <div className="text-slate-500 space-y-2">
                <File size={48} className="mx-auto opacity-50" />
                <p>No active tasks</p>
                <p className="text-sm">Start a task to see progress here</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {tasks.map((task) => (
                <Card key={task.id} className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(task.status)}
                      <div>
                        <h3 className="font-medium text-slate-800">{task.name}</h3>
                        <p className={`text-sm ${getStatusColor(task.status)}`}>
                          {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {task.status === 'running' && (
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => handleTaskControl(task.id, 'pause')}
                        >
                          <Pause size={16} />
                        </Button>
                      )}
                      {task.status === 'paused' && (
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => handleTaskControl(task.id, 'resume')}
                        >
                          <Play size={16} />
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => handleTaskControl(task.id, 'stop')}
                      >
                        <Square size={16} />
                      </Button>
                    </div>
                  </div>
                  
                  <Progress value={task.progress} className="mb-3" />
                  
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{task.progress}% complete</span>
                    <span>
                      Running for {formatDuration(Date.now() - task.startTime)}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Recent Results */}
        <section>
          <h2 className="text-lg font-light text-slate-800 mb-6">Recent Results</h2>
          <Card className="p-6">
            <div className="text-center text-slate-500 space-y-2">
              <Download size={32} className="mx-auto opacity-50" />
              <p>No recent results</p>
              <p className="text-sm">Completed tasks will appear here</p>
            </div>
          </Card>
        </section>
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
