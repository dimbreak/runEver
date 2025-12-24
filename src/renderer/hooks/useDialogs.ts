import * as React from 'react';
import { dialogService } from '../services/dialogService';

export function useDialogs() {
  return React.useMemo(() => dialogService, []);
}

