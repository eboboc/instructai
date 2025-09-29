import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { updateUserProfile } from '../../services/firebase';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import * as logger from '@/utils/logger';

const UserProfile: React.FC = () => {
  const { currentUser, userData } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (userData) {
      setDisplayName(userData.displayName || '');
      setLocation(userData.location || '');
      setBio(userData.bio || '');
    }
  }, [userData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    if (!currentUser) {
      setError('You must be logged in to update your profile');
      setLoading(false);
      return;
    }

    try {
      logger.info('UserProfile', 'Updating user profile', { userId: currentUser.uid });
      
      const updatedData = {
        displayName,
        location,
        bio
      };
      
      const result = await updateUserProfile(currentUser.uid, updatedData);
      
      if (result.error) {
        logger.error('UserProfile', 'Failed to update profile', { error: result.error });
        setError(result.error);
      } else {
        logger.info('UserProfile', 'Profile updated successfully');
        setSuccess(true);
      }
    } catch (err: any) {
      logger.error('UserProfile', 'Error updating profile', { error: err.message });
      setError('Failed to update profile: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <Card>
        <CardContent className="py-10">
          <div className="text-center">
            <p>Please log in to view your profile</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Your Profile</CardTitle>
        <CardDescription>
          Update your personal information
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {success && (
            <Alert variant="default" className="bg-green-50 text-green-800 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription>Your profile has been updated successfully</AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={currentUser.email || ''}
              disabled
              className="bg-gray-50"
            />
            <p className="text-sm text-muted-foreground">Email cannot be changed</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How we should call you"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="location">Location (optional)</Label>
            <Input
              id="location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, Country"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="bio">Bio (optional)</Label>
            <Input
              id="bio"
              type="text"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short description about yourself"
            />
          </div>
          
          <Button 
            type="submit" 
            className="w-full" 
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating Profile...
              </>
            ) : (
              'Update Profile'
            )}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex justify-between">
        <p className="text-sm text-muted-foreground">
          Last updated: {userData?.updatedAt ? new Date(userData.updatedAt.seconds * 1000).toLocaleString() : 'Never'}
        </p>
      </CardFooter>
    </Card>
  );
};

export default UserProfile;
