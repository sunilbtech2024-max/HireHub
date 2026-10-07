import { useCallback, useEffect, useMemo, useState } from "react";
import AuthContext from "./authContext";
import api from "../services/api";

const TOKEN_KEY = "hirehub_token";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) return undefined;

    let active = true;

    const restoreSession = async () => {
      try {
        const { data } = await api.get("/auth/me");
        if (active) {
          setUser(data.user);
          setCompany(data.company || null);
        }
      } catch (error) {
        if (!active) return;

        if (error.response?.status === 401 || error.response?.status === 403) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
          setCompany(null);
        } else {
          console.error("Unable to restore the HireHub session:", error);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    restoreSession();
    return () => {
      active = false;
    };
  }, [token]);

  const saveSession = useCallback((data) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    setCompany(data.company || null);
  }, []);

  const login = useCallback(async (credentials) => {
    const { data } = await api.post("/auth/login", credentials);
    saveSession(data);
    return data;
  }, [saveSession]);

  const register = useCallback(async (details) => {
    const { data } = await api.post("/auth/register", details);
    saveSession(data);
    return data;
  }, [saveSession]);

  const updateProfile = useCallback(async (profile) => {
    const { data } = await api.put("/users/profile", profile);
    setUser(data.user);
    return data.user;
  }, []);

  const updateCompanyProfile = useCallback(async (profile) => {
    const { data } = await api.put("/companies/profile", profile);
    setCompany(data.company);
    return data.company;
  }, []);

  const requestCompanyVerification = useCallback(async () => {
    const { data } = await api.post("/companies/verification-request");
    setCompany(data.company);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setCompany(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      company,
      isLoading,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      updateProfile,
      updateCompanyProfile,
      requestCompanyVerification,
      logout,
    }),
    [
      token,
      user,
      company,
      isLoading,
      login,
      register,
      updateProfile,
      updateCompanyProfile,
      requestCompanyVerification,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
