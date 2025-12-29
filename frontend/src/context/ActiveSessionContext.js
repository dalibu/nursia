import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const ActiveSessionContext = createContext();

export function useActiveSession() {
    return useContext(ActiveSessionContext);
}

export function ActiveSessionProvider({ children }) {
    const [activeSession, setActiveSession] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [loading, setLoading] = useState(true);

    // Callback ref for session change notifications
    const sessionChangeCallback = useRef(null);

    // Register callback for session changes (used by TimeTrackerPage to refresh table)
    const setOnSessionChange = useCallback((callback) => {
        sessionChangeCallback.current = callback;
    }, []);

    // Notify subscribers of session change
    const notifySessionChange = useCallback(() => {
        if (sessionChangeCallback.current) {
            sessionChangeCallback.current();
        }
    }, []);

    // Fetch active session
    const fetchActiveSession = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setActiveSession(null);
                return;
            }
            const response = await axios.get('/api/assignments/active', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            // API returns array, take first active session
            const sessions = response.data;
            if (sessions && sessions.length > 0) {
                setActiveSession(sessions[0]);
            } else {
                setActiveSession(null);
            }
        } catch (error) {
            console.error('Failed to fetch active session:', error);
            setActiveSession(null);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial fetch and polling every 5 seconds for real-time timer updates
    useEffect(() => {
        fetchActiveSession();
        const interval = setInterval(fetchActiveSession, 5000);
        return () => clearInterval(interval);
    }, [fetchActiveSession]);

    // Update current time every second for timer display
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Calculate elapsed times based on current time
    // NOTE: API's total_work_seconds already includes elapsed time for the active segment
    // We only need to add the delta since the last API fetch to keep display updating between polls
    const getElapsedTimes = useCallback(() => {
        if (!activeSession) return { work: '00:00:00', pause: '00:00:00', workSeconds: 0, pauseSeconds: 0 };

        // API already calculates elapsed at the moment of the response
        // We need to add the time that passed since we received that response
        // activeSession was set when we received the API response, so we track time since then

        // Calculate delta since the activeSession was fetched
        // Use start_time to calculate full elapsed, then subtract API's value to get delta
        const dateTimeStr = `${activeSession.assignment_date}T${activeSession.start_time}`;
        const startTime = new Date(dateTimeStr);
        const fullElapsedSeconds = Math.max(0, Math.floor((currentTime - startTime) / 1000));

        // API returned these values (which included elapsed at that moment)
        const apiWorkSeconds = activeSession.total_work_seconds || 0;
        const apiPauseSeconds = activeSession.total_pause_seconds || 0;

        // Calculate the delta (how much the current segment has progressed since API fetch)
        // API value = previous segments + elapsed at fetch time
        // We want = previous segments + elapsed NOW
        // Delta = elapsed NOW - elapsed at fetch = fullElapsedSeconds - (apiWorkSeconds - previousSegments)
        // Simplification: just use API values + small delta for real-time feel

        // The simplest correct approach: API already has correct total at fetch time
        // Just update the active segment with time passed since fetch
        let workSeconds = apiWorkSeconds;
        let pauseSeconds = apiPauseSeconds;

        // For real-time updates between polling intervals, we need to calculate
        // how much time passed since the data was fetched. But since we don't track
        // fetch timestamp, we'll poll more frequently (every 5 seconds) instead.
        // For now, just return API values (they update every 30s via polling)

        // Format as HH:MM:SS
        const formatTime = (seconds) => {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = seconds % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        };

        return {
            work: formatTime(workSeconds),
            pause: formatTime(pauseSeconds),
            workSeconds,
            pauseSeconds
        };
    }, [activeSession, currentTime]);

    // Session control actions with OPTIMISTIC UI updates
    const stopSession = async () => {
        if (!activeSession) return;

        // Optimistic update: immediately hide timer
        const previousSession = activeSession;
        setActiveSession(null);

        try {
            const token = localStorage.getItem('token');
            await axios.post(`/api/assignments/${previousSession.id}/stop`, {}, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            notifySessionChange(); // Notify subscribers to refresh
        } catch (error) {
            console.error('Failed to stop session:', error);
            // Rollback on error
            setActiveSession(previousSession);
            throw error;
        }
    };

    const togglePause = async () => {
        if (!activeSession) return;

        // Optimistic update: immediately toggle pause state
        const previousSession = activeSession;
        const newSessionType = activeSession.session_type === 'pause' ? 'work' : 'pause';
        setActiveSession({ ...activeSession, session_type: newSessionType });

        try {
            const token = localStorage.getItem('token');
            const endpoint = previousSession.session_type === 'pause' ? 'resume' : 'pause';
            await axios.post(`/api/assignments/${previousSession.id}/${endpoint}`, {}, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            await fetchActiveSession(); // Refresh with server data
            notifySessionChange(); // Notify subscribers to refresh
        } catch (error) {
            console.error('Failed to toggle pause:', error);
            // Rollback on error
            setActiveSession(previousSession);
            throw error;
        }
    };

    const value = {
        activeSession,
        loading,
        currentTime,
        getElapsedTimes,
        fetchActiveSession,
        stopSession,
        togglePause,
        setOnSessionChange,
        notifySessionChange
    };

    return (
        <ActiveSessionContext.Provider value={value}>
            {children}
        </ActiveSessionContext.Provider>
    );
}

