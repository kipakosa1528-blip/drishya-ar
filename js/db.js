// Fast Local Storage Caching & Synchronization Client for Kipakosa AR

import { authHeaders } from './auth.js';

const CACHE_KEY = 'kipakosa_projects_cache';
const CACHE_TIME_KEY = 'kipakosa_cache_time';

// Read cached projects synchronously from localStorage (0ms instant render)
export function getLocalProjects() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Save projects to localStorage
export function setLocalProjects(projects) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(projects));
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
  } catch (err) {
    console.warn('LocalStorage quota exceeded or unavailable:', err);
  }
}

// Invalidate cache
export function invalidateCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIME_KEY);
  } catch {}
}

// Stale-While-Revalidate: returns cached immediately, fetches fresh in background
export async function getAllProjects(onBackgroundUpdate = null) {
  const cached = getLocalProjects();

  // Trigger background fetch
  const fetchPromise = (async () => {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('API error: ' + res.status);
      const fresh = await res.json();
      setLocalProjects(fresh);
      if (onBackgroundUpdate && typeof onBackgroundUpdate === 'function') {
        onBackgroundUpdate(fresh);
      }
      return fresh;
    } catch (err) {
      console.warn('Background project fetch failed:', err);
      return cached || [];
    }
  })();

  // If we already have cached data (even an empty list), return it immediately
  if (Array.isArray(cached)) {
    return cached;
  }

  // Otherwise wait for network response
  return await fetchPromise;
}

// Get single project by ID with local cache fallback
export async function getProject(id, onBackgroundUpdate = null) {
  const cachedList = getLocalProjects();
  const cachedItem = cachedList?.find(p => p.id === id);

  const fetchPromise = (async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) return null;
      const fresh = await res.json();
      if (fresh) {
        // Update item in local cached list
        const updatedList = (getLocalProjects() || []).filter(p => p.id !== id);
        updatedList.unshift(fresh);
        setLocalProjects(updatedList);
        if (onBackgroundUpdate && typeof onBackgroundUpdate === 'function') {
          onBackgroundUpdate(fresh);
        }
      }
      return fresh;
    } catch (err) {
      console.warn('Background project detail fetch failed:', err);
      return cachedItem || null;
    }
  })();

  if (cachedItem) {
    return cachedItem;
  }

  return await fetchPromise;
}

// Delete project and update local cache immediately
export async function deleteProject(id) {
  // Optimistically remove from local storage
  const current = getLocalProjects();
  if (current) {
    setLocalProjects(current.filter(p => p.id !== id));
  }

  const res = await fetch(`/api/projects/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateProject(id, updates) {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(updates)
  });
  if (!res.ok) throw new Error(await res.text());
  const fresh = await res.json();
  const current = getLocalProjects() || [];
  setLocalProjects([fresh, ...current.filter(p => p.id !== id)]);
  return fresh;
}


