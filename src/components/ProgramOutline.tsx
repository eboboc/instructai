import React from 'react';
import { FlattenedInterval, BlockType } from '../types/timer';
import { formatTime, getBlockColorClass, getBlockProgress } from '../utils/timerUtils';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Progress } from './ui/progress';
import { Clock, Target, CheckCircle2 } from 'lucide-react';

interface ProgramOutlineProps {
  intervals: FlattenedInterval[];
  currentIndex: number;
  totalDuration: number;
  breakDuration?: number | 'manual';
  onIntervalClick?: (index: number) => void;
}

export const ProgramOutline: React.FC<ProgramOutlineProps> = ({
  intervals,
  currentIndex,
  totalDuration,
  breakDuration = 'manual',
  onIntervalClick
}) => {
  // Group intervals by block for cleaner display
  const blockGroups = intervals.reduce((acc, interval, index) => {
    const key = interval.blockId || interval.blockName;
    if (!acc[key]) {
      acc[key] = {
        blockId: interval.blockId,
        blockName: interval.blockName,
        blockType: interval.blockType,
        intervals: [],
        startIndex: index,
        totalDuration: 0
      };
    }
    acc[key].intervals.push({ ...interval, originalIndex: index });
    acc[key].totalDuration += interval.duration;
    return acc;
  }, {} as Record<string, any>);

  const blockProgressInfo = getBlockProgress(intervals, currentIndex);

  return (
    <Card className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-semibold flex items-center gap-2 mb-2">
          <Target className="w-4 h-4" />
          Program Outline
        </h3>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-3 h-3" />
          {formatTime(totalDuration)} total
        </div>
        
        {/* Overall Block Progress */}
        <div className="mt-3">
          <div className="flex justify-between items-center text-xs text-muted-foreground mb-1">
            <span>Block Progress</span>
            <span>{blockProgressInfo.currentBlockIndex + 1} / {blockProgressInfo.totalBlocks}</span>
          </div>
          <Progress 
            value={((blockProgressInfo.currentBlockIndex) / Math.max(blockProgressInfo.totalBlocks - 1, 1)) * 100} 
            className="h-2"
          />
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {Object.values(blockGroups).map((group: any, groupIndex) => {
            const isCurrentBlock = (group.blockId || group.blockName) === (blockProgressInfo.blockId || blockProgressInfo.blockName);
            const isCompletedBlock = group.startIndex + group.intervals.length - 1 < currentIndex;
            const blockProgress = isCurrentBlock ? 
              ((blockProgressInfo.progressInBlock) / Math.max(blockProgressInfo.totalBlockIntervals - 1, 1)) * 100 : 
              isCompletedBlock ? 100 : 0;
            
            const colorClass = getBlockColorClass(group.blockType);
            
            return (
              <React.Fragment key={groupIndex}>
                {/* Block Header */}
                <div className={`p-3 rounded-lg border transition-all ${
                  isCurrentBlock 
                    ? `${colorClass} border-2 shadow-lg` 
                    : isCompletedBlock
                      ? 'bg-muted/60 border-muted'
                      : 'bg-card border-border hover:bg-accent/20'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={`font-medium text-sm flex items-center gap-2 ${
                      isCurrentBlock ? '' : isCompletedBlock ? 'text-muted-foreground' : ''
                    }`}>
                      {isCompletedBlock && <CheckCircle2 className="w-4 h-4" />}
                      {group.blockName}
                    </h4>
                    <span className={`text-xs font-mono ${
                      isCurrentBlock ? '' : isCompletedBlock ? 'text-muted-foreground' : 'text-muted-foreground'
                    }`}>
                      {formatTime(group.totalDuration)}
                    </span>
                  </div>
                  
                  {/* Block Type Badge */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      isCurrentBlock 
                        ? 'bg-white/20 text-current' 
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {group.blockType}
                    </span>
                    <span className={`text-xs ${
                      isCurrentBlock ? '' : 'text-muted-foreground'
                    }`}>
                      {group.intervals.length} intervals
                    </span>
                  </div>
                  
                  {/* Block Progress Bar */}
                  <div className="space-y-1">
                    <Progress 
                      value={blockProgress} 
                      className={`h-1.5 ${
                        isCurrentBlock ? 'bg-white/20' : 'bg-muted'
                      }`}
                    />
                    {isCurrentBlock && (
                      <div className="text-xs opacity-75">
                        {blockProgressInfo.progressInBlock + 1} / {blockProgressInfo.totalBlockIntervals} intervals
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Block Break Sliver */}
                {groupIndex < Object.values(blockGroups).length - 1 && (
                  <div className="h-3 flex items-center justify-center">
                    <div className="w-full h-1 bg-break rounded-full flex items-center justify-center">
                      <span className="text-xs text-break-foreground bg-background px-2 py-0.5 rounded-full border">
                        {typeof breakDuration === 'number' ? `${breakDuration}s break` : 'Manual start'}
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Collapsible interval details for current block */}
                {isCurrentBlock && (
                  <div className="ml-2 space-y-1">
                    {group.intervals.slice(Math.max(0, blockProgressInfo.progressInBlock - 1), blockProgressInfo.progressInBlock + 3).map((interval: any) => {
                      const isActive = interval.originalIndex === currentIndex;
                      const isPast = interval.originalIndex < currentIndex;
                      
                      return (
                        <div
                          key={interval.originalIndex}
                          onClick={() => onIntervalClick?.(interval.originalIndex)}
                          className={`
                            p-2 rounded border text-xs transition-all cursor-pointer
                            ${isActive 
                              ? 'bg-accent border-accent-foreground/20 font-medium scale-105' 
                              : isPast
                                ? 'bg-muted/30 text-muted-foreground border-muted opacity-60'
                                : 'bg-card border-border hover:bg-accent/20'
                            }
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`${isActive ? 'font-semibold' : ''}`}>
                              {interval.activity}
                            </span>
                            <span className="font-mono opacity-75">
                              {formatTime(interval.duration)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Show more indicator */}
                    {group.intervals.length > blockProgressInfo.progressInBlock + 3 && (
                      <div className="text-xs text-muted-foreground text-center py-1">
                        ... {group.intervals.length - (blockProgressInfo.progressInBlock + 3)} more intervals
                      </div>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
};