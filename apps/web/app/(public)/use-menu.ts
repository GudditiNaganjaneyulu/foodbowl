'use client';

import * as React from 'react';
import { apiClient } from '@/lib/api-client';

export interface MenuItemDTO {
  id: string;
  name: string;
  description: string | null;
  price: string;
  isVeg: boolean;
  isAvailable: boolean;
}

export interface CategoryDTO {
  id: string;
  name: string;
  menuItems: MenuItemDTO[];
}

export function useMenu() {
  const [categories, setCategories] = React.useState<CategoryDTO[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiClient
      .get<{ categories: CategoryDTO[] }>('/api/v1/menu')
      .then((res) => setCategories(res.categories))
      .catch(() => setError('Could not reach the API. Is it running? (pnpm dev:api)'));
  }, []);

  return { categories, error, isLoading: !categories && !error };
}
