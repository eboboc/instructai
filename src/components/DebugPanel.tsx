import React, { useState, useEffect } from 'react';
import { getLogs, clearLogs } from '../utils/logger';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { X, RefreshCw, Download } from 'lucide-react';

export const DebugPanel: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    if (isOpen) {
      refreshLogs();
    }
  }, [isOpen]);

  const refreshLogs = () => {
    setLogs(getLogs());
  };

  const handleClearLogs = () => {
    clearLogs();
    setLogs([]);
  };

  const downloadLogs = () => {
    const logsJson = JSON.stringify(logs, null, 2);
    const blob = new Blob([logsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `app-logs-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  };

  const filteredLogs = activeTab === 'all' 
    ? logs 
    : logs.filter(log => log.level === activeTab.toUpperCase());

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-50 bg-slate-800 text-white"
        size="sm"
      >
        Debug
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-20 right-4 w-[90vw] max-w-[600px] max-h-[70vh] z-50 shadow-xl">
      <CardHeader className="p-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Debug Panel</CardTitle>
        <div className="flex gap-2">
          <Button size="icon" variant="ghost" onClick={refreshLogs}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={downloadLogs}>
            <Download className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setIsOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
          <div className="border-b px-3">
            <TabsList className="h-9">
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              <TabsTrigger value="debug" className="text-xs">Debug</TabsTrigger>
              <TabsTrigger value="info" className="text-xs">Info</TabsTrigger>
              <TabsTrigger value="warn" className="text-xs">Warnings</TabsTrigger>
              <TabsTrigger value="error" className="text-xs">Errors</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value={activeTab} className="m-0">
            <div className="flex justify-between items-center px-3 py-1 border-b">
              <div className="text-xs text-muted-foreground">
                {filteredLogs.length} log entries
              </div>
              <Button variant="ghost" size="sm" onClick={handleClearLogs} className="h-7 text-xs">
                Clear Logs
              </Button>
            </div>
            
            <ScrollArea className="h-[calc(70vh-120px)] rounded-md">
              <div className="p-3 space-y-1">
                {filteredLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No logs to display
                  </div>
                ) : (
                  filteredLogs.map((log, index) => (
                    <div 
                      key={index} 
                      className={`text-xs p-2 rounded ${
                        log.level === 'ERROR' ? 'bg-red-50 text-red-800' :
                        log.level === 'WARN' ? 'bg-yellow-50 text-yellow-800' :
                        log.level === 'INFO' ? 'bg-blue-50 text-blue-800' :
                        'bg-gray-50 text-gray-800'
                      }`}
                    >
                      <div className="font-mono">
                        <span className="opacity-70">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        {' '}
                        <span className="font-semibold">[{log.component}]</span>
                        {' '}
                        {log.message}
                      </div>
                      {log.data && (
                        <pre className="mt-1 overflow-x-auto text-[10px] p-1 bg-black/5 rounded">
                          {log.data}
                        </pre>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
