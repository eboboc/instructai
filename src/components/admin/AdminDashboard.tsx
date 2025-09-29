import React, { useState, useEffect } from 'react';
import { getAllUsers, getAllWorkouts } from '../../services/firebase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import UsersList from './UsersList';
import WorkoutsList from './WorkoutsList';
import * as logger from '@/utils/logger';

const AdminDashboard: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    logger.info('AdminDashboard', 'Fetching admin data');

    try {
      // Fetch all users
      logger.debug('AdminDashboard', 'Fetching users');
      const usersResult = await getAllUsers();
      
      if (usersResult.error) {
        logger.error('AdminDashboard', 'Error fetching users', { error: usersResult.error });
        setError(`Error fetching users: ${usersResult.error}`);
      } else {
        logger.info('AdminDashboard', 'Users fetched successfully', { count: usersResult.data.length });
        setUsers(usersResult.data || []);
      }

      // Fetch all workouts
      logger.debug('AdminDashboard', 'Fetching workouts');
      const workoutsResult = await getAllWorkouts();
      
      if (workoutsResult.error) {
        logger.error('AdminDashboard', 'Error fetching workouts', { error: workoutsResult.error });
        setError(prev => prev ? `${prev}. Error fetching workouts: ${workoutsResult.error}` : `Error fetching workouts: ${workoutsResult.error}`);
      } else {
        logger.info('AdminDashboard', 'Workouts fetched successfully', { count: workoutsResult.data.length });
        setWorkouts(workoutsResult.data || []);
      }
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('AdminDashboard', 'Failed to fetch data', { error: errorMessage, stack: err.stack });
      setError(`Failed to fetch data: ${errorMessage}`);
      console.error('Admin dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Data
        </Button>
      </div>
      
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error}
            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={fetchData}>
                Try Again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Total Users</CardTitle>
            <CardDescription>Number of registered users</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{users.length}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Total Workouts</CardTitle>
            <CardDescription>Number of saved workouts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{workouts.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="mb-6">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="workouts">Workouts</TabsTrigger>
        </TabsList>
        
        <TabsContent value="users">
          <UsersList users={users} />
        </TabsContent>
        
        <TabsContent value="workouts">
          <WorkoutsList workouts={workouts} users={users} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminDashboard;
