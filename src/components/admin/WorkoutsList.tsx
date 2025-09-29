import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Eye, Search } from 'lucide-react';

interface WorkoutsListProps {
  workouts: any[];
  users: any[];
}

const WorkoutsList: React.FC<WorkoutsListProps> = ({ workouts, users }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Filter workouts based on search term
  const filteredWorkouts = workouts.filter(workout => {
    const searchLower = searchTerm.toLowerCase();
    
    // Find user who created this workout
    const user = users.find(u => u.id === workout.userId);
    const userName = user?.displayName || user?.email || 'Unknown User';
    
    return (
      workout.id?.toLowerCase().includes(searchLower) ||
      workout.plan?.metadata?.class_name?.toLowerCase().includes(searchLower) ||
      userName.toLowerCase().includes(searchLower)
    );
  });

  const handleViewWorkout = (workout: any) => {
    setSelectedWorkout(workout);
    setIsDialogOpen(true);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    
    try {
      // Handle Firestore Timestamp
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleString();
      }
      
      // Handle regular date strings or objects
      return new Date(timestamp).toLocaleString();
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user?.displayName || user?.email || 'Unknown User';
  };

  return (
    <div>
      <div className="flex items-center mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search workouts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workout Name</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredWorkouts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No workouts found
                </TableCell>
              </TableRow>
            ) : (
              filteredWorkouts.map((workout) => (
                <TableRow key={workout.id}>
                  <TableCell className="font-medium">
                    {workout.plan?.metadata?.class_name || 'Unnamed Workout'}
                  </TableCell>
                  <TableCell>{getUserName(workout.userId)}</TableCell>
                  <TableCell>{workout.plan?.metadata?.modality || 'N/A'}</TableCell>
                  <TableCell>{workout.plan?.metadata?.duration_min || 'N/A'} min</TableCell>
                  <TableCell>{formatDate(workout.createdAt)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewWorkout(workout)}
                    >
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Workout Details</DialogTitle>
            <DialogDescription>
              Detailed information about the workout
            </DialogDescription>
          </DialogHeader>
          
          {selectedWorkout && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="font-semibold">ID:</div>
                <div className="truncate">{selectedWorkout.id}</div>
                
                <div className="font-semibold">Name:</div>
                <div>{selectedWorkout.plan?.metadata?.class_name || 'Unnamed Workout'}</div>
                
                <div className="font-semibold">Created By:</div>
                <div>{getUserName(selectedWorkout.userId)}</div>
                
                <div className="font-semibold">Format:</div>
                <div>{selectedWorkout.plan?.metadata?.modality || 'N/A'}</div>
                
                <div className="font-semibold">Duration:</div>
                <div>{selectedWorkout.plan?.metadata?.duration_min || 'N/A'} min</div>
                
                <div className="font-semibold">Created:</div>
                <div>{formatDate(selectedWorkout.createdAt)}</div>
                
                <div className="font-semibold">Last Updated:</div>
                <div>{formatDate(selectedWorkout.updatedAt)}</div>
              </div>
              
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2">Workout Blocks</h4>
                <div className="space-y-4">
                  {selectedWorkout.plan?.blocks?.map((block: any, index: number) => (
                    <div key={index} className="border rounded-md p-4">
                      <h5 className="font-semibold">{block.name} ({block.type})</h5>
                      <p className="text-sm text-muted-foreground mb-2">{block.duration} - {block.pattern}</p>
                      
                      <div className="mt-2">
                        <h6 className="text-sm font-medium mb-1">Timeline:</h6>
                        <ul className="text-sm space-y-1 pl-4">
                          {block.timeline?.map((item: string, i: number) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      
                      {block.cues?.length > 0 && (
                        <div className="mt-2">
                          <h6 className="text-sm font-medium mb-1">Cues:</h6>
                          <ul className="text-sm space-y-1 pl-4">
                            {block.cues.map((cue: string, i: number) => (
                              <li key={i}>{cue}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2">Raw Workout Data</h4>
                <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-60">
                  {JSON.stringify(selectedWorkout.plan, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkoutsList;
