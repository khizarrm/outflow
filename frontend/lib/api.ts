/**
 * API Client for Applyo Frontend
 * Handles API requests to the worker backend
 */

/**
 * Base fetch wrapper - calls worker API directly
 */
async function apiFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  // Use relative URL on client (proxied), full URL on server
  const baseUrl = typeof window !== 'undefined' 
    ? '' 
    : (process.env.NEXT_PUBLIC_API_URL || 'https://applyo-worker.applyo.workers.dev');
    
  const url = `${baseUrl}${endpoint}`;
  console.log("fetching: ", url);

  const defaultOptions: RequestInit = {
    credentials: 'include', // Include cookies for session management
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  const response = await fetch(url, { ...defaultOptions, ...options });
  
  if (!response.ok) {
    console.error("API Error:", response.status, response.statusText, "URL:", url);
  }
  
  return response;
}

// ============= AUTH API =============

/**
 * Authentication API
 */
export const auth = {
  /**
   * Login anonymously (creates a new anonymous user session)
   */
  loginAnonymously: async () => {
    const response = await apiFetch('/api/auth/sign-in/anonymous', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Anonymous login failed');
    }

    return response.json();
  },

  /**
   * Sign up with email and password
   */
  signUp: async (email: string, password: string, name?: string) => {
    const response = await apiFetch('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Sign up failed');
    }

    return response.json();
  },

  /**
   * Sign in with email and password
   */
  signIn: async (email: string, password: string) => {
    const response = await apiFetch('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Sign in failed');
    }

    return response.json();
  },

  /**
   * Sign out (clears session)
   */
  signOut: async () => {
    const response = await apiFetch('/api/auth/sign-out', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error('Sign out failed');
    }

    return response.json();
  },

  /**
   * Get current session
   */
  getSession: async () => {
    const response = await apiFetch('/api/auth/get-session');

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data?.session ? data : null;
  },

  /**
   * Get geolocation data
   */
  getGeolocation: async () => {
    const response = await apiFetch('/api/auth/cloudflare/geolocation');

    if (!response.ok) {
      return null;
    }

    return response.json();
  },
};

// ============= PUBLIC API =============

/**
 * Public API endpoints
 */
export const publicApi = {
  /**
   * Get public hello message
   */
  hello: async () => {
    const response = await apiFetch('/api/public/hello');
    return response.json();
  },

  /**
   * Get server info
   */
  info: async () => {
    const response = await apiFetch('/api/public/info');
    return response.json();
  },
};

// ============= PROTECTED API =============

/**
 * Protected API endpoints (require authentication)
 */
export const protectedApi = {
  /**
   * Get user profile
   */
  getProfile: async () => {
    const response = await apiFetch('/api/protected/profile');

    if (!response.ok) {
      throw new Error('Failed to fetch profile');
    }

    return response.json();
  },

  /**
   * Create a new item
   */
  createItem: async (data: {
    name: string;
    description?: string;
    category?: string;
  }) => {
    const response = await apiFetch('/api/protected/items', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Failed to create item');
    }

    return response.json();
  },

  /**
   * List all items
   */
  listItems: async () => {
    const response = await apiFetch('/api/protected/items');

    if (!response.ok) {
      throw new Error('Failed to fetch items');
    }

    return response.json();
  },

  /**
   * Delete an item by ID
   */
  deleteItem: async (id: string) => {
    const response = await apiFetch(`/api/protected/items/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to delete item');
    }

    return response.json();
  },
};

// ============= AGENTS API =============

/**
 * Agents API endpoints
 */
export const agentsApi = {
  /**
   * Call prospects agent
   */
  prospects: async (query: string) => {
    const response = await apiFetch('/api/agents/prospects', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error('Failed to call prospects agent');
    }

    return response.json();
  },

  /**
   * Call email finder agent
   */
  emailFinder: async (data: {
    firstName: string;
    lastName: string;
    company: string;
    domain: string;
  }) => {
    const response = await apiFetch('/api/agents/emailfinder', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to find emails');
    }

    return response.json();
  },

  /**
   * Call orchestrator agent
   */
  orchestrator: async (data: { query: string }) => {
    const response = await apiFetch('/api/agents/orchestrator', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to run orchestrator');
    }

    return response.json();
  },
};

// ============= TYPES =============

export interface User {
  id: string;
  email: string | null;
  name: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  expiresAt: string;
}

export interface AuthResponse {
  user: User;
  session: Session;
}

export interface GeolocationData {
  timezone?: string;
  city?: string;
  country?: string;
  region?: string;
  regionCode?: string;
  colo?: string;
  latitude?: string;
  longitude?: string;
}

export interface OrchestratorPerson {
  name: string;
  role: string;
  emails: string[];
}

export interface OrchestratorResponse {
  company?: string;
  people?: OrchestratorPerson[];
  favicon?: string | null;
  message?: string;
  state?: unknown;
  error?: string;
}
