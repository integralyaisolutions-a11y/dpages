"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserApi } from "@/lib/api";
import { createMockUser, deleteMockUser, getMockUsers, updateMockUser } from "@/mocks/users";

export type UserFormValues = {
  name: string;
  email: string;
  role: UserApi["role"];
  status: UserApi["status"];
  // Buit en mode edit vol dir "no canviar la contrasenya actual".
  password: string;
};

type UseUsersResult = {
  data: UserApi[];
  isLoading: boolean;
  error: Error | null;
  createUser: (values: UserFormValues) => void;
  editUser: (id: string, values: UserFormValues) => void;
  deleteUser: (id: string) => void;
};

export function useUsers(): UseUsersResult {
  const [data, setData] = useState<UserApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    getMockUsers()
      .then((users) => {
        if (!cancelled) setData(users);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught : new Error(String(caught)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const createUser = useCallback((values: UserFormValues) => {
    createMockUser({ id: crypto.randomUUID(), ...values }).then(setData);
  }, []);

  const editUser = useCallback(
    (id: string, values: UserFormValues) => {
      const target = data.find((item) => item.id === id);
      if (!target) return;
      const password = values.password.trim() === "" ? target.password : values.password;
      updateMockUser(id, {
        id,
        name: values.name,
        email: values.email,
        role: values.role,
        status: values.status,
        password,
      }).then(setData);
    },
    [data],
  );

  const deleteUser = useCallback((id: string) => {
    deleteMockUser(id).then(setData);
  }, []);

  return { data, isLoading, error, createUser, editUser, deleteUser };
}
