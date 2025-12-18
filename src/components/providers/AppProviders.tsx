"use client";
import { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { store } from '@/store/store';

import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/src/lib/tanStack/queryClient';

import SessionWrapper from './SessionWrapper';

export function AppProviders({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient() 
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <SessionWrapper>{children}</SessionWrapper>
      </QueryClientProvider>
    </Provider>
  );
}